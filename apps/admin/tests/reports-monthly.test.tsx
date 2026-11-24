import React from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";

const client = vi.hoisted(() => ({ apiData: vi.fn() }));
vi.mock("@/lib/use-mocks", () => ({ USE_MOCKS: false }));
vi.mock("@/lib/api-client", () => client);

import ReportsPage from "@/app/(app)/reports/page";

describe("monthly sales report", () => {
  beforeEach(() => {
    client.apiData.mockReset();
    client.apiData.mockImplementation((endpoint: string) => {
      if (endpoint.startsWith("/api/reports/monthly")) {
        return Promise.resolve({
          type: "monthly",
          rows: [
            { month: "2025-03-01", orderCount: 4, totalSales: 1000 },
            { month: "2026-02-01", orderCount: 8, totalSales: 2500 },
          ],
          totals: { orderCount: 12, totalSales: 3500 },
        });
      }
      if (endpoint.startsWith("/api/reports/best-sellers")) {
        return Promise.resolve({
          type: "best-sellers",
          rows: [
            { productId: 1, productName: "Salabat", unitsSold: 46, revenue: 3450, currentUnitCost: null },
            { productId: 2, productName: "Tablea Hot Chocolate", unitsSold: 45, revenue: 5850, currentUnitCost: null },
            { productId: 3, productName: "Cheese Pandesal", unitsSold: 41, revenue: 2255, currentUnitCost: null },
            { productId: 4, productName: "Iced Americano", unitsSold: 39, revenue: 4290, currentUnitCost: null },
            { productId: 5, productName: "Longsilog", unitsSold: 35, revenue: 4900, currentUnitCost: null },
            { productId: 6, productName: "Product 6", unitsSold: 34, revenue: 5100, currentUnitCost: null },
          ],
        });
      }
      return Promise.resolve({
        type: "daily",
        rows: [],
        totals: { orderCount: 0, totalSales: 0 },
      });
    });
  });

  it("shows a continuous twelve-month chart and table for the selected ending month", async () => {
    renderWithProviders(<ReportsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Monthly Sales" }));

    const monthPicker = screen.getByLabelText("Month");
    fireEvent.change(monthPicker, { target: { value: "2026-02" } });

    expect(
      await screen.findByRole("heading", {
        name: "Sales — 12 months ending 2026-02",
      }),
    ).toBeInTheDocument();
    expect(client.apiData).toHaveBeenCalledWith(
      "/api/reports/monthly?from=2025-03-01&to=2026-02-01",
      expect.anything(),
    );

    await waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(13);
    });
    expect(screen.getByText("2025-03")).toBeInTheDocument();
    expect(screen.getByText("2026-02")).toBeInTheDocument();
    const emptyMonth = screen.getByText("2025-04").closest("tr");
    expect(emptyMonth).not.toBeNull();
    expect(within(emptyMonth!).getAllByRole("cell")[1]).toHaveTextContent("0");
    expect(within(emptyMonth!).getAllByRole("cell")[2]).toHaveTextContent(
      "₱0.00",
    );
  });

  it("shows a top-five units chart and sales ranking for the selected dates", async () => {
    renderWithProviders(<ReportsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Best Sellers" }));
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-10-30" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-11-05" },
    });

    expect(
      await screen.findByRole("heading", {
        name: "Top 5 — 2026-10-30 to 2026-11-05",
      }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(client.apiData).toHaveBeenLastCalledWith(
        "/api/reports/best-sellers?from=2026-10-30&to=2026-11-05&limit=20",
        expect.anything(),
      );
    });

    const chart = screen.getByRole("region", { name: "Best sellers chart" });
    expect(within(chart).getAllByRole("listitem")).toHaveLength(5);
    expect(within(chart).getByText("Salabat")).toBeInTheDocument();
    expect(within(chart).queryByText("Product 6")).not.toBeInTheDocument();

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(7);
    expect(within(table).getByRole("columnheader", { name: "Qty Sold" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Sales" })).toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "Est. Gross Profit" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
  });
});
