import React from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@gunita/contracts";
import { renderWithProviders } from "@/test/render";

vi.mock("@/lib/use-mocks", () => ({ USE_MOCKS: false }));

const ordersApi = vi.hoisted(() => ({
  listOrders: vi.fn(),
  updateOrderStatus: vi.fn(),
  getOrder: vi.fn(),
  NEXT_STATUS: { pending: "preparing", preparing: "completed" },
}));
vi.mock("@/features/orders/api", () => ordersApi);

import OrdersPage from "@/app/(app)/orders/page";

const order: Order = {
  orderId: 12,
  clientTxId: "a1b2c3d4-e5f6-4789-a123-456789012345",
  status: "pending",
  orderType: "dine-in",
  orderDate: "2026-11-02T18:22:00.000Z",
  cashierId: 1,
  cashierName: "Juan Dela Cruz",
  items: [
    {
      lineId: 101,
      productId: 4,
      ingredientId: null,
      isAddon: false,
      name: "Iced Spanish Latte",
      quantity: 1,
      unitPrice: 160,
      subtotal: 160,
      customization: "Less Sugar, Large",
      specialInstructions: null,
    },
    {
      lineId: 102,
      productId: null,
      ingredientId: 8,
      isAddon: true,
      name: "Oreo Biscuits",
      quantity: 1,
      unitPrice: 25,
      subtotal: 25,
      customization: null,
      specialInstructions: null,
    },
  ],
  total: 185,
  payment: null,
};

describe("Owner orders board", () => {
  beforeEach(() => {
    ordersApi.listOrders.mockReset().mockResolvedValue([order]);
    ordersApi.updateOrderStatus.mockReset().mockResolvedValue(order);
    ordersApi.getOrder.mockReset().mockResolvedValue(order);
  });

  it("shows product and add-on lines with queue, cashier, and order details", async () => {
    renderWithProviders(<OrdersPage />);

    const table = screen.getByRole("table");
    await waitFor(() => {
      expect(within(table).getAllByRole("row")).toHaveLength(3);
    });
    const rows = within(table).getAllByRole("row");
    const headerRow = rows[0];
    const productRow = rows[1];
    const addonRow = rows[2];
    if (!headerRow || !productRow || !addonRow)
      throw new Error("Expected product and add-on rows.");
    expect(within(headerRow).getAllByRole("columnheader")).toHaveLength(13);

    const productCells = within(productRow).getAllByRole("cell");
    expect(productCells[1]).toHaveTextContent("012");
    expect(productCells[2]).toHaveTextContent("Juan Dela Cruz");
    expect(productCells[4]).toHaveTextContent("Nov 3, 2026");
    expect(productCells[6]).toHaveTextContent("Iced Spanish Latte");
    expect(productCells[7]).toHaveTextContent("—");
    expect(productCells[8]).toHaveTextContent("No");

    const addonCells = within(addonRow).getAllByRole("cell");
    expect(addonCells[6]).toHaveTextContent("Iced Spanish Latte");
    expect(addonCells[7]).toHaveTextContent("Oreo Biscuits");
    expect(addonCells[8]).toHaveTextContent("Yes");
    expect(addonCells[10]).toHaveTextContent("₱25.00");
  });

  it("filters by queue, status, and Manila business date", async () => {
    renderWithProviders(<OrdersPage />);
    await waitFor(() => {
      expect(screen.getAllByText("012")).toHaveLength(2);
    });

    fireEvent.change(screen.getByPlaceholderText("Queue no. e.g. 012"), {
      target: { value: "A-12" },
    });
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      3,
    );

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "completed" },
    });
    await waitFor(() => {
      expect(
        within(screen.getByRole("table")).getAllByRole("row"),
      ).toHaveLength(2);
    });
    await waitFor(() => {
      expect(ordersApi.listOrders).toHaveBeenLastCalledWith({
        status: "completed",
        date: undefined,
      });
    });

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-11-03" },
    });
    await waitFor(() => {
      expect(ordersApi.listOrders).toHaveBeenLastCalledWith({
        status: "completed",
        date: "2026-11-03",
      });
    });
  });

  it("opens order details from the queue number and keeps actions off the board", async () => {
    renderWithProviders(<OrdersPage />);
    await waitFor(() => {
      expect(
        screen.getAllByRole("link", { name: "View details for order 012" }),
      ).toHaveLength(2);
    });
    expect(
      screen.getAllByRole("link", { name: "View details for order 012" })[0],
    ).toHaveAttribute("href", "/orders/12");
    expect(
      screen.queryByRole("button", { name: /Actions for order/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Cancel order" }),
    ).not.toBeInTheDocument();
  });
});
