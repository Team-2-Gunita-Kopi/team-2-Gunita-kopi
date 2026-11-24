import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/owner/test/render";

vi.mock("@/owner/lib/use-mocks", () => ({ USE_MOCKS: false }));
const client = vi.hoisted(() => ({ apiData: vi.fn() }));
vi.mock("@/owner/lib/api-client", () => client);
const download = vi.hoisted(() => ({ downloadCsv: vi.fn() }));
vi.mock("@/owner/features/reports/api", async (importActual) => ({
  ...(await importActual<typeof import("@/owner/features/reports/api")>()),
  ...download,
}));
vi.mock("@/owner/features/orders/api", async (importActual) => ({
  ...(await importActual<typeof import("@/owner/features/orders/api")>()),
  listOrders: async () => [],
}));

import ReportsPage from "@/app/(owner)/admin/(app)/reports/page";
import { manilaToday } from "@/owner/features/orders/api";

describe("Reports Export CSV and Print", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.apiData.mockImplementation((endpoint: string) => {
      if (endpoint.startsWith("/api/reports/daily")) {
        return Promise.resolve({
          type: "daily",
          rows: [{ date: manilaToday(), orderCount: 2, itemsSold: 3, totalSales: 1250 }],
          totals: { orderCount: 2, itemsSold: 3, totalSales: 1250 },
        });
      }
      if (endpoint.startsWith("/api/reports/stock-status")) {
        return Promise.resolve({
          type: "stock-status",
          rows: [
            { ingredientId: 1, ingredientName: "Fresh Milk", unit: "ml", currentStock: 100, reorderLevel: 500, stockStatus: "low-stock", supplierName: null },
          ],
        });
      }
      return Promise.resolve({ type: "monthly", rows: [], totals: { orderCount: 0, totalSales: 0 } });
    });
  });

  it("exports the daily table with its column names", async () => {
    renderWithProviders(<ReportsPage />);
    const exportButton = await screen.findByRole("button", { name: "Export CSV" });
    await waitFor(() => expect(exportButton).toBeEnabled());
    await userEvent.click(exportButton);
    const [filename, csv] = download.downloadCsv.mock.calls[0] as [string, string];
    expect(filename).toBe(`gunita-kopi-daily-${manilaToday()}.csv`);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Date,Orders,Sales");
    expect(lines).toHaveLength(8); // header + 7 days
    expect(lines[7]).toBe(`${manilaToday()},2,"₱1,250.00"`);
  });

  it("exports stock status with readable status labels", async () => {
    renderWithProviders(<ReportsPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Stock Status" }));
    await screen.findByText("Fresh Milk");
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const [, csv] = download.downloadCsv.mock.calls[0] as [string, string];
    expect(csv).toBe("Ingredient,Unit,Current Stock,Reorder Level,Status\r\nFresh Milk,ml,100,500,Low Stock");
  });

  it("prints the page", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    renderWithProviders(<ReportsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalled();
  });
});
