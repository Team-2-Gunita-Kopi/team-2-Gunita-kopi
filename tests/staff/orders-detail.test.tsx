import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/react";
import type { Order } from "@/contracts";
import { renderWithProviders } from "@/staff/test/render";

vi.mock("@/staff/lib/use-mocks", () => ({ USE_MOCKS: false }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useParams: () => ({ id: "11" }),
}));

const ordersApi = vi.hoisted(() => ({
  getOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
  NEXT_STATUS: { pending: "preparing", preparing: "completed" },
}));
vi.mock("@/staff/features/orders/api", () => ordersApi);

import PosOrderDetailsPage from "@/app/(staff)/staff/(pos)/orders/[id]/page";

const order: Order = {
  orderId: 11,
  clientTxId: "a1b2c3d4-e5f6-4789-a123-456789012345",
  status: "pending",
  orderType: "take-out",
  orderDate: "2026-11-03T04:59:00.000Z",
  cashierId: 1,
  cashierName: "Juan Dela Cruz",
  items: [
    {
      lineId: 99,
      productId: 4,
      ingredientId: null,
      isAddon: false,
      name: "Longsilog",
      quantity: 2,
      unitPrice: 140,
      subtotal: 280,
      customization: "Scrambled egg",
      specialInstructions: null,
    },
    {
      lineId: 100,
      productId: 5,
      ingredientId: null,
      isAddon: false,
      name: "Ensaymada",
      quantity: 2,
      unitPrice: 70,
      subtotal: 140,
      customization: "Heated",
      specialInstructions: null,
    },
  ],
  total: 420,
  payment: {
    amountPaid: 500,
    changeAmount: 80,
    paymentMethod: "cash",
    receivedBy: 1,
    dateTime: "2026-11-03T05:00:00.000Z",
  },
};

describe("Barista order details page", () => {
  beforeEach(() => {
    ordersApi.getOrder.mockReset().mockResolvedValue(order);
    ordersApi.updateOrderStatus
      .mockReset()
      .mockImplementation((_id: number, status: Order["status"]) =>
        Promise.resolve({ ...order, status }),
      );
  });

  it("shows order items, queue details, payment, and status actions", async () => {
    renderWithProviders(<PosOrderDetailsPage />);

    expect(
      await screen.findByRole("heading", { name: "Order 011" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2× Longsilog")).toBeInTheDocument();
    expect(screen.getByText("2× Ensaymada")).toBeInTheDocument();
    expect(screen.getByText("011")).toBeInTheDocument();
    expect(screen.getAllByText("Juan Dela Cruz")).toHaveLength(2);
    expect(screen.getByText("₱500.00")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pending → Preparing" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel order" }),
    ).toBeInTheDocument();
  });

  it("advances order status from details", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosOrderDetailsPage />);
    await screen.findByRole("heading", { name: "Order 011" });

    await user.click(
      screen.getByRole("button", { name: "Pending → Preparing" }),
    );

    await waitFor(() => {
      expect(ordersApi.updateOrderStatus).toHaveBeenCalledWith(11, "preparing");
    });
    expect(
      await screen.findByRole("button", { name: "Preparing → Completed" }),
    ).toBeInTheDocument();
  });

  it("confirms cancellation before updating the order", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosOrderDetailsPage />);
    await screen.findByRole("heading", { name: "Order 011" });

    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    const confirmation = await screen.findByRole("dialog", {
      name: "Cancel order",
    });
    expect(ordersApi.updateOrderStatus).not.toHaveBeenCalled();
    await user.click(
      within(confirmation).getByRole("button", { name: "Cancel order" }),
    );

    await waitFor(() => {
      expect(ordersApi.updateOrderStatus).toHaveBeenCalledWith(11, "cancelled");
    });
  });

  it("opens a receipt from order details", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosOrderDetailsPage />);
    await screen.findByRole("heading", { name: "Order 011" });

    await user.click(screen.getByRole("button", { name: "Receipt" }));

    expect(screen.getByRole("dialog", { name: "Receipt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
  });
});
