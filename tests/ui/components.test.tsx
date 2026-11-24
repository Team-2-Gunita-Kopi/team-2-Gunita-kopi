import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Order } from "@/contracts/ui";
import {
  Banner,
  Button,
  DataTable,
  EmptyState,
  formatQueueNumber,
  Input,
  PageHeader,
  Receipt,
  Seg,
  Skeleton,
  StatusBadge,
  Tabs,
} from "@/ui";

const order: Order = {
  id: "o1",
  clientTxId: "tx1",
  orderNumber: "20261116-A-001",
  status: "completed",
  type: "take-out",
  items: [
    {
      productName: "Latte",
      productId: "p1",
      quantity: 2,
      unitPrice: 170,
      subtotal: 340,
    },
  ],
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
    render(
      <Button variant="outline" size="lg">
        Old
      </Button>,
    );
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
    expect(screen.getByRole("button", { name: "Dine-in" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Take-out" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await userEvent.click(screen.getByRole("button", { name: "Take-out" }));
    expect(onChange).toHaveBeenCalledWith("take-out");
  });

  it("Tabs renders subtab links with the active one marked", () => {
    render(
      <Tabs
        activeTab="b"
        tabs={[
          { id: "a", label: "A", href: "#a" },
          { id: "b", label: "B", href: "#b" },
        ]}
      />,
    );
    expect(screen.getByRole("tab", { name: "B" })).toHaveClass(
      "subtab-link",
      "on",
    );
    expect(screen.getByRole("tab", { name: "A" })).toHaveAttribute(
      "href",
      "#a",
    );
  });

  it("PageHeader renders the Baybayin kicker with its latin caption", () => {
    const { container } = render(
      <PageHeader latin="gunita · admin" title="Dashboard" />,
    );
    const kicker = container.querySelector(".kicker");
    expect(kicker).toHaveTextContent("ᜄᜓᜈᜒᜆ");
    expect(kicker).toHaveAttribute("data-latin", "gunita · admin");
    expect(kicker).toHaveAttribute("lang", "tl-Tglg");
    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
  });

  it("formats queue numbers without the letter prefix", () => {
    expect(formatQueueNumber("A-018")).toBe("018");
    expect(formatQueueNumber("20261116-A-018")).toBe("018");
    expect(formatQueueNumber(18)).toBe("018");
    expect(formatQueueNumber("OFF-018")).toBe("OFF-018");
  });

  it("Receipt shows queue number, total, footer and pending sync", () => {
    const { rerender } = render(
      <Receipt
        order={order}
        shopName="Gunita Kopi"
        footer="Salamat po! Come again."
        cashierName="Ana"
        pendingSync
      />,
    );
    expect(screen.getByText("001")).toBeInTheDocument();
    expect(screen.getAllByText("₱340.00").length).toBeGreaterThan(0);
    expect(screen.getByText("Salamat po! Come again.")).toBeInTheDocument();
    expect(screen.getByText("Pending sync")).toBeInTheDocument();
    rerender(
      <Receipt
        order={order}
        shopName="Gunita Kopi"
        footer="x"
        cashierName="Ana"
      />,
    );
    expect(screen.queryByText("Pending sync")).toBeNull();
  });

  it("Receipt shows capitalized method when paid and Unpaid row otherwise", () => {
    const { rerender } = render(
      <Receipt order={order} shopName="S" footer="f" cashierName="Ana" />,
    );
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Change")).toBeInTheDocument();
    rerender(
      <Receipt
        order={{ ...order, paidAmount: 0, changeAmount: 0 }}
        shopName="S"
        footer="f"
        cashierName="Ana"
      />,
    );
    expect(screen.getByText("Unpaid")).toBeInTheDocument();
    expect(screen.queryByText("Change")).toBeNull();
  });

  it("Banner danger uses the banner-danger class", () => {
    render(<Banner tone="danger">Oops</Banner>);
    expect(screen.getByRole("alert")).toHaveClass(
      "lowstock-banner",
      "banner-danger",
    );
  });

  it("Skeleton renders the requested rows", () => {
    const { container } = render(<Skeleton rows={4} />);
    expect(container.querySelectorAll(".skeleton-row")).toHaveLength(4);
  });

  it("EmptyState renders the message and action", () => {
    render(<EmptyState message="Nothing here" action={<button>Add</button>} />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("DataTable rows are keyboard-activatable", async () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={[{ key: "n", header: "Name" }]}
        data={[{ id: "1", n: "Latte" }]}
        keyExtractor={(r) => r.id}
        onRowClick={onRowClick}
      />,
    );
    const row = screen.getByText("Latte").closest("tr")!;
    expect(row).toHaveAttribute("tabindex", "0");
    expect(row).toHaveClass("row-click");
    row.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it("Input links its error text via aria-describedby", () => {
    render(<Input label="Name" error="Required" />);
    const id = screen.getByLabelText(/Name/).getAttribute("aria-describedby")!;
    expect(document.getElementById(id)).toHaveTextContent("Required");
  });
});
