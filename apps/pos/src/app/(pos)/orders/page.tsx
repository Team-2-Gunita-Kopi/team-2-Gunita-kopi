"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Order, OrderStatus } from "@gunita/contracts";
import { ORDER_TYPE_LABEL } from "@gunita/contracts/ui";
import {
  Button,
  DataTable,
  StatusBadge,
  formatPeso,
  formatQueueNumber,
} from "@gunita/ui";
import type { Column } from "@gunita/ui";
import { USE_MOCKS } from "@/lib/use-mocks";
import { posDb, type OutboxOrderRecord } from "@/offline/db";
import { listOrders } from "@/features/orders/api";

interface OrderLineRow {
  key: string;
  orderId: number | null;
  line: number;
  queue: string;
  cashier: string;
  type: string;
  orderDate: string;
  status: OrderStatus;
  product: string;
  ingredient: string;
  addon: string;
  quantity: number;
  unitPrice: string;
  customization: string;
  specialInstructions: string;
}

type StatusFilter = OrderStatus | "all";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit",
});
const BUSINESS_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
});

const sampleData: Omit<OrderLineRow, "key" | "orderId">[] = [
  {
    line: 101,
    queue: "012",
    cashier: "Juan Dela Cruz",
    type: "Dine-in",
    orderDate: "2026-11-03T14:22:00+08:00",
    status: "preparing",
    product: "Iced Spanish Latte",
    ingredient: "—",
    addon: "No",
    quantity: 1,
    unitPrice: formatPeso(145),
    customization: "Sugar 50%",
    specialInstructions: "No lid",
  },
  {
    line: 102,
    queue: "012",
    cashier: "Juan Dela Cruz",
    type: "Dine-in",
    orderDate: "2026-11-03T14:22:00+08:00",
    status: "preparing",
    product: "Iced Spanish Latte",
    ingredient: "Hazelnut syrup",
    addon: "Yes",
    quantity: 1,
    unitPrice: formatPeso(15),
    customization: "—",
    specialInstructions: "—",
  },
  {
    line: 99,
    queue: "011",
    cashier: "Juan Dela Cruz",
    type: "Take-out",
    orderDate: "2026-11-03T14:10:00+08:00",
    status: "pending",
    product: "Longsilog",
    ingredient: "—",
    addon: "No",
    quantity: 2,
    unitPrice: formatPeso(140),
    customization: "Scrambled egg",
    specialInstructions: "—",
  },
  {
    line: 100,
    queue: "011",
    cashier: "Juan Dela Cruz",
    type: "Take-out",
    orderDate: "2026-11-03T13:59:00+08:00",
    status: "pending",
    product: "Ensaymada",
    ingredient: "—",
    addon: "No",
    quantity: 2,
    unitPrice: formatPeso(70),
    customization: "Heated",
    specialInstructions: "—",
  },
  {
    line: 97,
    queue: "010",
    cashier: "Juan Dela Cruz",
    type: "Take-out",
    orderDate: "2026-11-03T12:47:00+08:00",
    status: "pending",
    product: "Iced Americano",
    ingredient: "—",
    addon: "No",
    quantity: 1,
    unitPrice: formatPeso(110),
    customization: "Less ice",
    specialInstructions: "—",
  },
  {
    line: 98,
    queue: "010",
    cashier: "Juan Dela Cruz",
    type: "Take-out",
    orderDate: "2026-11-03T12:47:00+08:00",
    status: "pending",
    product: "Iced Spanish Latte",
    ingredient: "—",
    addon: "No",
    quantity: 1,
    unitPrice: formatPeso(145),
    customization: "Sugar 25%",
    specialInstructions: "Serve last",
  },
  {
    line: 94,
    queue: "009",
    cashier: "Maria Santos",
    type: "Take-out",
    orderDate: "2026-11-03T12:16:00+08:00",
    status: "completed",
    product: "Tapsilog",
    ingredient: "—",
    addon: "No",
    quantity: 1,
    unitPrice: formatPeso(150),
    customization: "Sunny side up",
    specialInstructions: "—",
  },
  {
    line: 95,
    queue: "009",
    cashier: "Maria Santos",
    type: "Take-out",
    orderDate: "2026-11-03T12:16:00+08:00",
    status: "completed",
    product: "Kapeng Barako",
    ingredient: "—",
    addon: "No",
    quantity: 1,
    unitPrice: formatPeso(85),
    customization: "Extra hot",
    specialInstructions: "—",
  },
  {
    line: 96,
    queue: "009",
    cashier: "Maria Santos",
    type: "Take-out",
    orderDate: "2026-11-03T12:16:00+08:00",
    status: "completed",
    product: "Banana Bread",
    ingredient: "—",
    addon: "No",
    quantity: 1,
    unitPrice: formatPeso(60),
    customization: "—",
    specialInstructions: "—",
  },
];

const sampleRows = sampleData.map((row) => ({
  ...row,
  orderId: null,
  key: String(row.line),
}));

async function queuedOrders(): Promise<OutboxOrderRecord[]> {
  return posDb.ordersOutbox
    .where("status")
    .anyOf("pending", "syncing", "failed")
    .toArray();
}

// One row per drink or food item; its add-ons (own order lines, right after the item) are shown
// under Ingredient and their price is added to the item's unit price.
const addonLabel = (name: string, perUnit: number) => (perUnit > 1 ? `${name} ×${perUnit}` : name);

function flattenOrders(orders: Order[]): OrderLineRow[] {
  return orders.flatMap((order) => {
    const rows: OrderLineRow[] = [];
    let parent: { row: OrderLineRow; quantity: number; unit: number; addons: string[] } | null = null;
    for (const item of [...order.items].sort((a, b) => a.lineId - b.lineId)) {
      if (item.isAddon && parent) {
        const perUnit = parent.quantity > 0 ? item.quantity / parent.quantity : 0;
        parent.unit += item.unitPrice * perUnit;
        parent.addons.push(addonLabel(item.name ?? "—", perUnit));
        parent.row.ingredient = parent.addons.join(", ");
        parent.row.addon = "Yes";
        parent.row.unitPrice = formatPeso(parent.unit);
        continue;
      }
      const row: OrderLineRow = {
        key: `${order.orderId}-${item.lineId}`,
        orderId: order.orderId,
        line: item.lineId,
        queue: formatQueueNumber(order.orderId),
        cashier: order.cashierName ?? "—",
        type: order.orderType ? ORDER_TYPE_LABEL[order.orderType] : "—",
        orderDate: order.orderDate,
        status: order.status,
        product: item.name ?? "—",
        ingredient: item.isAddon ? (item.name ?? "—") : "—",
        addon: item.isAddon ? "Yes" : "No",
        quantity: item.quantity,
        unitPrice: formatPeso(item.unitPrice),
        customization: item.customization ?? "—",
        specialInstructions: item.specialInstructions ?? "—",
      };
      rows.push(row);
      parent = item.isAddon ? null : { row, quantity: item.quantity, unit: item.unitPrice, addons: [] };
    }
    return rows;
  });
}

function flattenQueuedOrders(records: OutboxOrderRecord[]): OrderLineRow[] {
  return records.flatMap((record) =>
    record.order.items.map((item, i) => {
      const addons = item.addons ?? [];
      const unit = item.unitPrice + addons.reduce((sum, a) => sum + a.price * a.quantity, 0);
      return {
        key: `${record.clientTxId}-${i + 1}`,
        orderId: null,
        line: i + 1,
        queue: record.provisionalNo ?? "Queued",
        cashier: "—",
        type: ORDER_TYPE_LABEL[record.order.type],
        orderDate: record.createdAt,
        status: "pending",
        product: item.productName,
        ingredient: addons.length ? addons.map((a) => addonLabel(a.label, a.quantity)).join(", ") : "—",
        addon: addons.length ? "Yes" : "No",
        quantity: item.quantity,
        unitPrice: formatPeso(unit),
        customization: item.customization ?? "—",
        specialInstructions: item.specialInstructions ?? "—",
      };
    }),
  );
}

function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMATTER.format(date);
}

function displayTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : TIME_FORMATTER.format(date);
}

function queueMatches(queue: string, search: string): boolean {
  const term = search
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!term) return true;
  const number = queue.toLowerCase();
  const numericTerm = term.replace(/^a/, "").replace(/^0+(?=\d)/, "");
  const numericQueue = number.replace(/^0+(?=\d)/, "");
  return (
    number.includes(term) ||
    `a${number}`.includes(term) ||
    (!!numericTerm && numericQueue.includes(numericTerm))
  );
}

function matchesBusinessDate(value: string, date: string): boolean {
  const parsed = new Date(value);
  return (
    !Number.isNaN(parsed.getTime()) &&
    BUSINESS_DATE_FORMATTER.format(parsed) === date
  );
}

export default function PosOrdersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState("");
  const orders = useQuery({
    queryKey: ["pos-orders", statusFilter, dateFilter],
    enabled: !USE_MOCKS,
    refetchInterval: 5000,
    queryFn: () =>
      listOrders({
        status: statusFilter,
        date: dateFilter || undefined,
      }),
  });
  const outbox = useQuery({
    queryKey: ["pos-orders-outbox"],
    enabled: !USE_MOCKS,
    refetchInterval: 5000,
    queryFn: queuedOrders,
  });

  const allRows = USE_MOCKS
    ? sampleRows
    : [
        ...flattenOrders(orders.data ?? []),
        ...flattenQueuedOrders(outbox.data ?? []),
      ];
  const rows = useMemo(
    () =>
      allRows.filter(
        (row) =>
          queueMatches(row.queue, search) &&
          (statusFilter === "all" || row.status === statusFilter) &&
          (!dateFilter || matchesBusinessDate(row.orderDate, dateFilter)),
      ),
    [allRows, dateFilter, search, statusFilter],
  );

  const columns: Column<OrderLineRow>[] = [
    { key: "line", header: "Line" },
    {
      key: "queue",
      header: "Queue",
      className: "mono",
      render: (row) =>
        !USE_MOCKS && row.orderId !== null ? (
          <Link
            href={`/orders/${row.orderId}`}
            className="order-queue-link"
            aria-label={`View details for order ${row.queue}`}
          >
            {row.queue}
          </Link>
        ) : (
          row.queue
        ),
    },
    { key: "cashier", header: "Cashier" },
    { key: "type", header: "Type" },
    {
      key: "orderDate",
      header: "Date & Time",
      render: (row) => (
        <span className="whitespace-nowrap">
          {displayDate(row.orderDate)}
          <br />
          {displayTime(row.orderDate)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    { key: "product", header: "Product" },
    { key: "ingredient", header: "Ingredient" },
    { key: "addon", header: "Add-on" },
    { key: "quantity", header: "Qty", className: "num" },
    { key: "unitPrice", header: "Unit Price", className: "num" },
    { key: "customization", header: "Customization" },
    { key: "specialInstructions", header: "Special Instructions" },
  ];

  return (
    <div className="barista-orders space-y-5">
      <header>
        <p className="product-page-kicker">Gunita · Order Board</p>
        <h1>Orders</h1>
      </header>

      <section aria-label="Order filters" className="barista-orders-filters">
        <label className="block text-xs font-medium text-gray-500">
          Search
          <input
            type="search"
            className="mt-1 w-full"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Queue no. e.g. 012"
          />
        </label>
        <label className="block text-xs font-medium text-gray-500">
          Status
          <select
            className="mt-1 w-full"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="preparing">Preparing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-gray-500">
          Date
          <input
            type="date"
            className="mt-1 w-full"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
          />
        </label>
        <Button
          variant="outline"
          className="self-end"
          disabled={!dateFilter}
          onClick={() => setDateFilter("")}
        >
          Clear date
        </Button>
      </section>

      {orders.error && !USE_MOCKS ? (
        <p role="alert" className="recipe-message error">
          {orders.error instanceof Error
            ? orders.error.message
            : "Could not load orders."}
        </p>
      ) : null}
      {outbox.error && !USE_MOCKS ? (
        <p role="alert" className="recipe-message error">
          {outbox.error instanceof Error
            ? outbox.error.message
            : "Could not load queued orders."}
        </p>
      ) : null}
      {!USE_MOCKS && (orders.isPending || outbox.isPending) ? (
        <p role="status">Loading orders…</p>
      ) : null}

      <DataTable<OrderLineRow>
        className="tbl-orders barista-orders-table"
        columns={columns}
        data={rows}
        emptyMessage={
          orders.error && !USE_MOCKS
            ? "Orders could not be loaded."
            : "No orders match these filters."
        }
        keyExtractor={(row) => row.key}
        // The whole row opens the order, not only the small queue number.
        onRowClick={(row) => {
          if (!USE_MOCKS && row.orderId !== null) router.push(`/orders/${row.orderId}`);
        }}
      />
    </div>
  );
}
