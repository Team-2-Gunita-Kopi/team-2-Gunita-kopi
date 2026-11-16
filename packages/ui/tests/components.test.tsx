import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Order } from "@gunita/contracts";
import { Button, PageHeader, Receipt, Seg, StatusBadge, Tabs } from "../src";

const order: Order = {
  id: "o1",
  clientTxId: "tx1",
  orderNumber: "20261116-A-001",
  status: "completed",
  type: "take-out",
  items: [{ productName: "Latte", productId: "p1", quantity: 2, unitPrice: 170, subtotal: 340 }],
  totalAmount: 340,
  taxAmount: 0,
  discountAmount: 0,
  paidAmount: 500,
  changeAmount: 160,
  paymentMethod: "cash",
  createdAt: "2026-11-16T08:00:00.000Z",
  createdBy: "u1",
};

describe("base components", () => {
  it("Button maps variant and size to prototype classes", () => {
    render(
      <Button variant="primary" size="sm">
        Go
      </Button>,
    );
    const b = screen.getByRole("button", { name: "Go" });
    expect(b).toHaveClass("btn", "btn-primary", "btn-sm");
  });

  it("Button keeps legacy variants compiling as plain btn", () => {
    render(<Button variant="outline" size="lg">Old</Button>);
    expect(screen.getByRole("button", { name: "Old" }).className).toBe("btn");
  });

  it("StatusBadge renders stock label with chip-out", () => {
    render(<StatusBadge status="out_of_stock" />);
    const chip = screen.getByText("Out");
    expect(chip).toHaveClass("chip", "chip-out");
  });

  it("StatusBadge maps sync states", () => {
    render(<StatusBadge status="pending" label="Pending sync" />);
    expect(screen.getByText("Pending sync")).toHaveClass("chip-low");
  });

  it("Seg marks only the selected option pressed and calls onChange", async () => {
    const onChange = vi.fn();
    render(
      <Seg
        label="Order type"
        value="dine-in"
        onChange={onChange}
        options={[
          { value: "dine-in", label: "Dine-in" },
          { value: "take-out", label: "Take-out" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Dine-in" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Take-out" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Take-out" }));
    expect(onChange).toHaveBeenCalledWith("take-out");
  });

  it("Tabs renders subtab links with the active one marked", () => {
    render(<Tabs activeTab="b" tabs={[{ id: "a", label: "A", href: "#a" }, { id: "b", label: "B", href: "#b" }]} />);
    expect(screen.getByRole("tab", { name: "B" })).toHaveClass("subtab-link", "on");
    expect(screen.getByRole("tab", { name: "A" })).toHaveAttribute("href", "#a");
  });

  it("PageHeader renders the Baybayin kicker with its latin caption", () => {
    const { container } = render(<PageHeader latin="gunita · admin" title="Dashboard" />);
    const kicker = container.querySelector(".kicker");
    expect(kicker).toHaveTextContent("ᜄᜓᜈᜒᜆ");
    expect(kicker).toHaveAttribute("data-latin", "gunita · admin");
    expect(kicker).toHaveAttribute("lang", "tl-Tglg");
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("Receipt shows queue number, total, footer and pending sync", () => {
    const { rerender } = render(
      <Receipt order={order} shopName="Gunita Kopi" footer="Salamat po! Come again." cashierName="Ana" pendingSync />,
    );
    expect(screen.getByText("20261116-A-001")).toBeInTheDocument();
    expect(screen.getAllByText("₱340.00").length).toBeGreaterThan(0);
    expect(screen.getByText("Salamat po! Come again.")).toBeInTheDocument();
    expect(screen.getByText("Pending sync")).toBeInTheDocument();
    rerender(<Receipt order={order} shopName="Gunita Kopi" footer="x" cashierName="Ana" />);
    expect(screen.queryByText("Pending sync")).toBeNull();
  });
});
