import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Order } from "@/contracts";
import type { OutboxOrderRecord } from "@/staff/offline/db";
import { renderWithProviders } from "@/staff/test/render";

vi.mock("@/staff/lib/use-mocks", () => ({ USE_MOCKS: false }));

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

const ordersApi = vi.hoisted(() => ({ listOrders: vi.fn() }));
const outboxApi = vi.hoisted(() => ({ toArray: vi.fn() }));
vi.mock("@/staff/features/orders/api", () => ordersApi);
vi.mock("@/staff/offline/db", () => ({
  posDb: {
    ordersOutbox: {
      where: () => ({ anyOf: () => ({ toArray: outboxApi.toArray }) }),
    },
  },
}));

import PosOrdersPage from "@/app/(staff)/staff/(pos)/orders/page";

const order: Order = {
  orderId: 18,
  clientTxId: "a1b2c3d4-e5f6-4789-a123-456789012345",
  status: "pending",
  orderType: "dine-in",
  orderDate: "2026-11-03T14:22:00.000Z",
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
      unitPrice: 145,
      subtotal: 145,
      customization: "Less sugar",
      specialInstructions: "No lid",
      status: "pending",
    },
    {
      lineId: 102,
      productId: null,
      ingredientId: 8,
      isAddon: true,
      name: "Hazelnut syrup",
      quantity: 1,
      unitPrice: 25,
      subtotal: 25,
      customization: null,
      specialInstructions: null,
      status: "pending",
    },
  ],
  total: 170,
  payment: null,
};

describe("Barista orders page", () => {
  beforeEach(() => {
    ordersApi.listOrders.mockReset().mockResolvedValue([order]);
    outboxApi.toArray.mockReset().mockResolvedValue([]);
  });

  it("shows one row per item with its add-ons and no status action buttons", async () => {
    renderWithProviders(<PosOrdersPage />);

    expect(await screen.findAllByText("018")).toHaveLength(1);
    const table = await screen.findByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([
      "Line",
      "Queue",
      "Cashier",
      "Type",
      "Date & Time",
      "Status",
      "Product",
      "Ingredient",
      "Add-on",
      "Qty",
      "Unit Price",
      "Customization",
      "Special Instructions",
    ]);
    expect(within(table).getAllByText("018")).toHaveLength(1);
    const queueLinks = within(table).getAllByRole("link", {
      name: "View details for order 018",
    });
    expect(queueLinks).toHaveLength(1);
    expect(queueLinks[0]).toHaveAttribute("href", "/staff/orders/18");
    expect(within(table).getAllByText("Iced Spanish Latte")).toHaveLength(1);
    expect(within(table).getByText("Hazelnut syrup")).toBeInTheDocument();
    // 145 + one Hazelnut syrup add-on at 25, per drink.
    expect(within(table).getByText("₱170.00")).toBeInTheDocument();
    expect(within(table).getAllByText("Pending")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: /Start|Complete|Cancel/ }),
    ).not.toBeInTheDocument();
  });

  it("opens the order when any cell of its row is clicked", async () => {
    nav.push.mockReset();
    renderWithProviders(<PosOrdersPage />);
    await userEvent.click(await screen.findByText("Hazelnut syrup"));
    expect(nav.push).toHaveBeenCalledWith("/staff/orders/18");
  });

  it("filters by queue, status, and Manila business date", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosOrdersPage />);
    await screen.findByRole("table");

    await user.selectOptions(screen.getByLabelText("Status"), "pending");
    await waitFor(() => {
      expect(ordersApi.listOrders).toHaveBeenLastCalledWith({
        status: "pending",
        date: undefined,
      });
    });

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-11-03" },
    });
    await waitFor(() => {
      expect(ordersApi.listOrders).toHaveBeenLastCalledWith({
        status: "pending",
        date: "2026-11-03",
      });
    });

    const search = screen.getByRole("searchbox", { name: "Search" });
    await user.type(search, "999");
    expect(
      within(screen.getByRole("table")).getByText(
        "No orders match these filters.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear date" }));
    await waitFor(() => {
      expect(ordersApi.listOrders).toHaveBeenLastCalledWith({
        status: "pending",
        date: undefined,
      });
    });
  });

  it("keeps local offline orders visible with their provisional queue number", async () => {
    const queued: OutboxOrderRecord = {
      clientTxId: "offline-transaction",
      order: {
        clientTxId: "offline-transaction",
        type: "take-out",
        items: [
          {
            productId: "4",
            productName: "Longsilog",
            quantity: 2,
            unitPrice: 140,
            subtotal: 280,
          },
        ],
        totalAmount: 280,
        taxAmount: 0,
        discountAmount: 0,
        paidAmount: 300,
        paymentMethod: "cash",
      },
      status: "failed",
      retryCount: 1,
      createdAt: "2026-11-03T14:22:00.000Z",
      updatedAt: "2026-11-03T14:22:00.000Z",
      provisionalNo: "OFF-001",
    };
    outboxApi.toArray.mockResolvedValue([queued]);

    renderWithProviders(<PosOrdersPage />);

    expect(await screen.findByText("OFF-001")).toBeInTheDocument();
    expect(screen.getByText("Longsilog")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /OFF-001/ }),
    ).not.toBeInTheDocument();
  });

  // Each item has its own status: a cancelled item must not show the order's status (2026-11-28).
  it("shows each item's own status, so a cancelled item is not shown as completed", async () => {
    const mixed: Order = {
      ...order,
      status: "completed",
      items: [
        { ...order.items[0]!, lineId: 40, isAddon: false, productId: 1, ingredientId: null, name: "Barkada", status: "cancelled" },
        { ...order.items[0]!, lineId: 42, isAddon: false, productId: 2, ingredientId: null, name: "Hungarian", status: "completed" },
      ],
    };
    ordersApi.listOrders.mockResolvedValue([mixed]);
    renderWithProviders(<PosOrdersPage />);
    const table = await screen.findByRole("table");
    const barkada = (await within(table).findByText("Barkada")).closest("tr")!;
    expect(within(barkada).getByText("Cancelled")).toBeInTheDocument();
    const hungarian = within(table).getByText("Hungarian").closest("tr")!;
    expect(within(hungarian).getByText("Completed")).toBeInTheDocument();
  });
});
