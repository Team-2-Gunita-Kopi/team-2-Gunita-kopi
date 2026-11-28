import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/owner/test/render";

vi.mock("@/owner/lib/use-mocks", () => ({ USE_MOCKS: false }));
const client = vi.hoisted(() => ({ apiData: vi.fn() }));
vi.mock("@/owner/lib/api-client", () => client);
vi.mock("@/owner/features/orders/api", async (importActual) => ({
  ...(await importActual<typeof import("@/owner/features/orders/api")>()),
  listOrders: async () => [
    { orderId: "A-7", orderDate: "2026-11-28T02:15:00Z", orderType: "dine-in", status: "completed", total: 450 },
    { orderId: "A-8", orderDate: "2026-11-28T03:00:00Z", orderType: "take-out", status: "cancelled", total: 120 },
  ],
}));

import ReportsPage from "@/app/(owner)/admin/(app)/reports/page";
import { manilaToday } from "@/owner/features/orders/api";

const PRINT_INFO = {
  reportId: "GK-RPT-20261128-AB12CD34",
  preparedAt: "2026-11-28T07:30:00.000Z",
  preparedBy: { fullName: "Ana Reyes", username: "ana.owner", role: "owner_admin" },
  ownerName: "Ana Reyes",
};

const printDoc = () => document.body.querySelector<HTMLElement>(".report-print")!;
const printPost = () => client.apiData.mock.calls.find(([, , opts]) => opts?.method === "POST");

describe("Reports Print", () => {
  let print: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    print = vi.spyOn(window, "print").mockImplementation(() => {});
    client.apiData.mockImplementation((endpoint: string, _schema: unknown, opts?: { method?: string }) => {
      if (opts?.method === "POST") return Promise.resolve(PRINT_INFO);
      if (endpoint.startsWith("/api/reports/daily")) {
        return Promise.resolve({
          type: "daily",
          rows: [
            { date: manilaToday(), orderCount: 2, itemsSold: 3, totalSales: 1250 },
            { date: manilaToday(new Date(Date.now() - 86_400_000)), orderCount: 1, itemsSold: 1, totalSales: 100.5 },
          ],
          totals: { orderCount: 3, totalSales: 1350.5 },
        });
      }
      if (endpoint.startsWith("/api/reports/stock-status")) {
        return Promise.resolve({
          type: "stock-status",
          rows: [
            { ingredientId: 1, ingredientName: "Fresh Milk", unit: "ml", currentStock: 100, reorderLevel: 500, stockStatus: "low-stock" },
            { ingredientId: 2, ingredientName: "Espresso Beans", unit: "g", currentStock: 900, reorderLevel: 200, stockStatus: "available" },
          ],
        });
      }
      return Promise.resolve({ type: "monthly", rows: [], totals: { orderCount: 0, totalSales: 0 } });
    });
  });

  it("has no Export CSV button", async () => {
    renderWithProviders(<ReportsPage />);
    await screen.findByRole("button", { name: "Print" });
    expect(screen.queryByRole("button", { name: /csv/i })).toBeNull();
  });

  it("prints the daily report with metadata, parameters, totals, preparation info and blank signatures", async () => {
    renderWithProviders(<ReportsPage />);
    await screen.findAllByText("₱1,250.00");
    await userEvent.click(screen.getByRole("button", { name: "Print" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));

    // Audited server-side; only the filters and the row count are sent, never the preparer.
    const [endpoint, , opts] = printPost()!;
    expect(endpoint).toBe("/api/reports/daily");
    const body = JSON.parse(opts.body);
    expect(body).toEqual({
      parameters: { Date: manilaToday(), Period: expect.stringMatching(/ to /), "Sales counted": "Completed orders only" },
      recordCount: 9, // 7 days + 2 orders
    });

    const doc = within(printDoc());
    expect(doc.getByRole("heading", { level: 1, name: "Daily Sales Report" })).toBeInTheDocument();
    expect(doc.getByText("Gunita Kopi", { selector: ".rp-business" })).toBeInTheDocument();
    expect(doc.getAllByText("GK-RPT-20261128-AB12CD34").length).toBeGreaterThan(1);
    // The preparer writes their name by hand on the printed copy: every "Prepared by" is a blank line.
    const preparedBy = doc.getAllByText("Prepared by", { selector: "dt" });
    expect(preparedBy).toHaveLength(2);
    preparedBy.forEach((dt) => {
      expect(dt.nextElementSibling).toHaveClass("rp-write");
      expect(dt.nextElementSibling!.textContent).toBe("");
    });
    expect(doc.getByText("ana.owner · Owner / Admin")).toBeInTheDocument();
    expect(doc.getByText(manilaToday(), { selector: "dd" })).toBeInTheDocument();

    // Totals match the shown rows: 3 orders, ₱1,350.50 over the 7 days.
    const daily = printDoc().querySelectorAll("table")[0]!;
    expect(daily.querySelectorAll("tbody tr")).toHaveLength(7);
    expect(daily.querySelector("tfoot")!.textContent).toBe("Total3₱1,350.50");
    const orders = printDoc().querySelectorAll("table")[1]!;
    expect(orders.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(orders.textContent).toContain("Cancelled");
    expect(doc.getByText("Records included").nextSibling!.textContent).toBe("9");

    const preparedRegion = doc.getByRole("region", { name: "PREPARED BY" });
    const prepared = within(preparedRegion);
    expect(preparedRegion.textContent).not.toContain("Ana Reyes");
    expect(preparedRegion.textContent).not.toContain("Owner / Admin");
    expect(prepared.getByText(/^Name:/).querySelector("span")!.textContent).toBe("");
    expect(prepared.getByText(/^Position:/).querySelector("span")!.textContent).toBe("");
    const approval = within(doc.getByRole("region", { name: "OWNER'S APPROVAL" }));
    expect(approval.getByText("Name: Ana Reyes")).toBeInTheDocument();
    expect(approval.getByText("Position: Owner")).toBeInTheDocument();
    // Signature, date and the preparer's name and position lines stay blank for handwriting: no image, no generated text.
    expect(printDoc().querySelectorAll(".rp-sign-line span")).toHaveLength(6);
    printDoc().querySelectorAll(".rp-sign-line span").forEach((s) => expect(s.textContent).toBe(""));
    expect(printDoc().querySelector("img, canvas, svg")).toBeNull();
  });

  it("prints only the filtered stock rows with readable status labels", async () => {
    renderWithProviders(<ReportsPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Stock Status" }));
    await screen.findByText("Fresh Milk");
    await userEvent.click(screen.getByRole("button", { name: "Low stock only" }));
    await userEvent.click(screen.getByRole("button", { name: "Print" }));
    await waitFor(() => expect(print).toHaveBeenCalled());

    expect(JSON.parse(printPost()![2].body)).toEqual({ parameters: { "Stock filter": "Low stock only" }, recordCount: 1 });
    const table = printDoc().querySelector("table")!;
    expect(table.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(table.textContent).toContain("Fresh Milkml100500Low Stock");
    expect(table.textContent).not.toContain("Espresso Beans");
  });

  it("shows the error and does not print when the server refuses", async () => {
    client.apiData.mockImplementation((endpoint: string, _s: unknown, opts?: { method?: string }) =>
      opts?.method === "POST"
        ? Promise.reject(new Error("You do not have access to this resource"))
        : Promise.resolve({ type: "daily", rows: [], totals: { orderCount: 0, totalSales: 0 } }),
    );
    renderWithProviders(<ReportsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Print" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have access to this resource");
    expect(print).not.toHaveBeenCalled();
    expect(printDoc()).toBeNull();
  });
});
