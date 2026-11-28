import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/react";
import type { Order } from "@/contracts";
import { renderWithProviders } from "@/owner/test/render";

vi.mock("@/owner/lib/use-mocks", () => ({ USE_MOCKS: false }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useParams: () => ({ id: "12" }),
}));

const ordersApi = vi.hoisted(() => ({
  getOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
  NEXT_STATUS: { pending: "preparing", preparing: "completed" },
}));
vi.mock("@/owner/features/orders/api", () => ordersApi);

import OrderDetailsPage from "@/app/(owner)/admin/(app)/orders/[id]/page";

const order: Order = {
  orderId: 12,
  clientTxId: "a1b2c3d4-e5f6-4789-a123-456789012345",
  status: "pending",
  orderType: "take-out",
  orderDate: "2026-11-02T18:22:00.000Z",
  cashierId: 1,
  cashierName: "Juan Dela Cruz",
  items: [
    {
      lineId: 101,
      productId: 4,
      ingredientId: null,
      isAddon: false,
      name: "Longsilog",
      quantity: 2,
      unitPrice: 140,
      subtotal: 280,
      customization: "Scrambled egg",
      specialInstructions: null,
      status: "pending",
      cancelReason: null,
    },
    {
      lineId: 102,
      productId: null,
      ingredientId: 8,
      isAddon: true,
      name: "Oreo Biscuits",
      quantity: 2,
      unitPrice: 25,
      subtotal: 50,
      customization: null,
      specialInstructions: null,
      status: "pending",
      cancelReason: null,
    },
  ],
  total: 330,
  payment: {
    amountPaid: 400,
    changeAmount: 70,
    paymentMethod: "cash",
    receivedBy: 1,
    dateTime: "2026-11-02T18:23:00.000Z",
  },
};

describe("Order details page", () => {
  beforeEach(() => {
    ordersApi.getOrder.mockReset().mockResolvedValue(order);
    ordersApi.updateOrderStatus
      .mockReset()
      .mockImplementation((_id: number, status: Order["status"]) =>
        Promise.resolve({ ...order, status }),
      );
  });

  it("shows order items, queue details, payment, and status actions", async () => {
    renderWithProviders(<OrderDetailsPage />);

    expect(
      await screen.findByRole("heading", { name: "Order 012" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2× Longsilog")).toBeInTheDocument();
    expect(screen.getByText("+ 2× Oreo Biscuits")).toBeInTheDocument();
    expect(screen.getByText("012")).toBeInTheDocument();
    expect(screen.getAllByText("Juan Dela Cruz")).toHaveLength(2);
    expect(screen.getByText("₱400.00")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pending → Preparing" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel order" }),
    ).toBeInTheDocument();
  });

  it("advances the order status from its detail page", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderDetailsPage />);
    await screen.findByRole("heading", { name: "Order 012" });

    await user.click(
      screen.getByRole("button", { name: "Pending → Preparing" }),
    );

    await waitFor(() => {
      expect(ordersApi.updateOrderStatus).toHaveBeenCalledWith(12, "preparing");
    });
    // Why: the button label changing is easy to miss; the toast confirms the server accepted it.
    expect(await screen.findByText("Order marked Preparing.")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Preparing → Completed" }),
    ).toBeInTheDocument();
  });

  it("opens a printable receipt from the order details", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderDetailsPage />);
    await screen.findByRole("heading", { name: "Order 012" });

    await user.click(screen.getByRole("button", { name: "Receipt" }));

    expect(screen.getByRole("dialog", { name: "Receipt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
  });

  // Once preparing, the customer pays for the order: the Owner cannot cancel it either.
  it("offers no cancel once the order is preparing", async () => {
    ordersApi.getOrder.mockResolvedValue({
      ...order,
      status: "preparing",
      items: order.items.map((i) => ({ ...i, status: "preparing" as const })),
    });
    renderWithProviders(<OrderDetailsPage />);
    await screen.findByRole("heading", { name: "Order 012" });
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
  });

  // Paid 400 = total 330 + change 10 + refunded 60.
  it("shows the refund of cancelled items to the Owner", async () => {
    const user = userEvent.setup();
    ordersApi.getOrder.mockResolvedValue({
      ...order,
      items: [
        ...order.items,
        {
          ...order.items[0]!,
          lineId: 103,
          productId: 5,
          name: "Ensaymada",
          quantity: 1,
          unitPrice: 60,
          subtotal: 60,
          customization: null,
          status: "cancelled",
          cancelReason: "Wrong order",
        },
      ],
      payment: { ...order.payment!, changeAmount: 10 },
    });
    renderWithProviders(<OrderDetailsPage />);
    await screen.findByRole("heading", { name: "Order 012" });

    const payment = screen.getByRole("heading", { name: "Payment" }).nextElementSibling as HTMLElement;
    expect(within(payment).getByText("Refunded").nextElementSibling).toHaveTextContent("₱60.00");
    expect(within(payment).getByText("Refund reason").nextElementSibling).toHaveTextContent("Wrong order");

    await user.click(screen.getByRole("button", { name: "Receipt" }));
    const receipt = screen.getByRole("dialog", { name: "Receipt" });
    expect(within(receipt).queryByText(/Ensaymada/)).toBeNull();
    expect(within(receipt).getByText("Total").closest("tr")).toHaveTextContent("₱330.00");
    expect(within(receipt).getByText("Refunded").closest("tr")).toHaveTextContent("₱60.00");
  });
});
