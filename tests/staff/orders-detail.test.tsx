import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
  cancelOrderItems: vi.fn(),
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
      status: "pending",
      cancelReason: null,
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
      status: "pending",
      cancelReason: null,
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
    expect(await screen.findByText("Order marked Preparing.")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Preparing → Completed" }),
    ).toBeInTheDocument();
  });

  // A refund needs a reason; the whole order is cancelled as all of its items so the reason is kept.
  it("asks for a reason before cancelling the whole order", async () => {
    const user = userEvent.setup();
    ordersApi.cancelOrderItems
      .mockReset()
      .mockResolvedValue({ ...order, status: "cancelled", total: 0 });
    renderWithProviders(<PosOrderDetailsPage />);
    await screen.findByRole("heading", { name: "Order 011" });

    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Cancel order — Order 011",
    });
    expect(within(dialog).getByText(/gets back ₱420\.00/)).toBeInTheDocument();
    const submit = within(dialog).getByRole("button", { name: "Cancel order" });
    expect(submit).toBeDisabled();
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "Reason" }),
      "Customer changed mind",
    );
    await user.click(submit);

    await waitFor(() => {
      expect(ordersApi.cancelOrderItems).toHaveBeenCalledWith(
        11,
        [
          { lineId: 99, quantity: 2 },
          { lineId: 100, quantity: 2 },
        ],
        "Customer changed mind",
      );
    });
    expect(await screen.findByText("Order cancelled.")).toBeInTheDocument();
    expect(ordersApi.updateOrderStatus).not.toHaveBeenCalled();
  });

  it("asks for a note when the reason is Other", async () => {
    const user = userEvent.setup();
    ordersApi.cancelOrderItems.mockReset().mockResolvedValue(order);
    renderWithProviders(<PosOrderDetailsPage />);
    await screen.findByRole("heading", { name: "Order 011" });

    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel order — Order 011" });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Reason" }), "Other");
    const submit = within(dialog).getByRole("button", { name: "Cancel order" });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "Note" }), " Spilled by rider ");
    await user.click(submit);

    await waitFor(() => {
      expect(ordersApi.cancelOrderItems).toHaveBeenCalledWith(
        11,
        expect.any(Array),
        "Spilled by rider",
      );
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

  // A customer may cancel one item, not the whole order (design 2026-11-28).
  const ensaymadaCancelled: Order = {
    ...order,
    items: order.items.map((i) =>
      i.lineId === 100 ? { ...i, status: "cancelled", cancelReason: "Customer changed mind" } : i,
    ),
    total: 280,
  };

  it("cancels only the items the barista ticks", async () => {
    const user = userEvent.setup();
    ordersApi.cancelOrderItems.mockReset().mockResolvedValue(ensaymadaCancelled);
    renderWithProviders(<PosOrderDetailsPage />);
    await screen.findByRole("heading", { name: "Order 011" });

    await user.click(screen.getByRole("button", { name: "Cancel items" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel items — Order 011" });
    const submit = within(dialog).getByRole("button", { name: "Cancel selected" });
    expect(submit).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: "2× Ensaymada" }));
    expect(submit).toBeDisabled();
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "Reason" }),
      "Customer changed mind",
    );
    await user.click(submit);

    await waitFor(() => {
      expect(ordersApi.cancelOrderItems).toHaveBeenCalledWith(
        11,
        [{ lineId: 100, quantity: 2 }],
        "Customer changed mind",
      );
    });
    expect(await screen.findByText("Items cancelled.")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("₱280.00", { selector: ".order-detail-total .num" })).toBeInTheDocument();
    expect(ordersApi.updateOrderStatus).not.toHaveBeenCalled();
  });

  it("lets the barista cancel part of an item's quantity", async () => {
    const user = userEvent.setup();
    ordersApi.cancelOrderItems.mockReset().mockResolvedValue(order);
    renderWithProviders(<PosOrderDetailsPage />);
    await screen.findByRole("heading", { name: "Order 011" });

    await user.click(screen.getByRole("button", { name: "Cancel items" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel items — Order 011" });
    await user.click(within(dialog).getByRole("checkbox", { name: "2× Longsilog" }));
    const howMany = within(dialog).getByRole("spinbutton", { name: "How many Longsilog to cancel" });
    expect(howMany).toHaveValue(2);
    fireEvent.change(howMany, { target: { value: "1" } });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Reason" }), "Wrong order");
    await user.click(within(dialog).getByRole("button", { name: "Cancel selected" }));

    await waitFor(() => {
      expect(ordersApi.cancelOrderItems).toHaveBeenCalledWith(
        11,
        [{ lineId: 99, quantity: 1 }],
        "Wrong order",
      );
    });
  });

  it("offers Cancel items only when the order has more than one item left to cancel", async () => {
    const single: Order = { ...order, items: [{ ...order.items[0]!, quantity: 1, subtotal: 140 }], total: 140 };
    ordersApi.getOrder.mockResolvedValue(single);
    const { unmount } = renderWithProviders(<PosOrderDetailsPage />);
    await screen.findByRole("heading", { name: "Order 011" });
    expect(screen.queryByRole("button", { name: "Cancel items" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeInTheDocument();
    unmount();

    ordersApi.getOrder.mockResolvedValue({ ...order, status: "completed" });
    renderWithProviders(<PosOrderDetailsPage />);
    await screen.findByRole("heading", { name: "Order 011" });
    expect(screen.queryByRole("button", { name: "Cancel items" })).toBeNull();
  });

  // Once preparing, the customer pays for the order: nothing can be cancelled (decided 2026-11-28).
  it("offers no cancel once the order is preparing", async () => {
    ordersApi.getOrder.mockResolvedValue({
      ...order,
      status: "preparing",
      items: order.items.map((i) => ({ ...i, status: "preparing" as const })),
    });
    renderWithProviders(<PosOrderDetailsPage />);
    await screen.findByRole("heading", { name: "Order 011" });
    expect(screen.getByRole("button", { name: "Preparing → Completed" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel items" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
  });

  // Paid 500 = total 280 + change 80 + refunded 140, so the numbers on paper add up.
  it("shows the refund on the receipt and in the payment details", async () => {
    const user = userEvent.setup();
    ordersApi.getOrder.mockResolvedValue(ensaymadaCancelled);
    renderWithProviders(<PosOrderDetailsPage />);
    await screen.findByRole("heading", { name: "Order 011" });

    const payment = screen.getByRole("heading", { name: "Payment" }).nextElementSibling as HTMLElement;
    expect(within(payment).getByText("Refunded").nextElementSibling).toHaveTextContent("₱140.00");
    expect(within(payment).getByText("Refund reason").nextElementSibling).toHaveTextContent(
      "Customer changed mind",
    );

    await user.click(screen.getByRole("button", { name: "Receipt" }));
    const receipt = screen.getByRole("dialog", { name: "Receipt" });
    expect(within(receipt).queryByText(/Ensaymada/)).toBeNull();
    expect(within(receipt).getByText("Total").closest("tr")).toHaveTextContent("₱280.00");
    expect(within(receipt).getByText("Change").closest("tr")).toHaveTextContent("₱80.00");
    expect(within(receipt).getByText("Refunded").closest("tr")).toHaveTextContent("₱140.00");
  });

  it("shows no refund rows when nothing was cancelled", async () => {
    renderWithProviders(<PosOrderDetailsPage />);
    await screen.findByRole("heading", { name: "Order 011" });
    expect(screen.queryByText("Refunded")).toBeNull();
    expect(screen.queryByText("Refund reason")).toBeNull();
  });
});
