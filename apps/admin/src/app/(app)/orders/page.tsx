"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import type { Order, OrderStatus } from "@gunita/contracts";
import {
  Button,
  DataTable,
  StatusBadge,
  formatPeso,
  formatQueueNumber,
} from "@gunita/ui";
import type { Column } from "@gunita/ui";
import { useLiveQuery } from "@/lib/data";
import { USE_MOCKS } from "@/lib/use-mocks";
import { listOrders } from "@/features/orders/api";

interface OrderLineRow extends Record<string, unknown> {
  key: string;
  line: number;
  orderId: number;
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

const sampleRows: OrderLineRow[] = [
  {
    key: "12-101",
    line: 101,
    orderId: 12,
    queue: "012",
    cashier: "Juan Dela Cruz",
    type: "Dine-in",
    orderDate: "2026-11-03T14:22:00+08:00",
    status: "preparing",
    product: "Iced Spanish Latte",
    ingredient: "—",
    addon: "No",
    quantity: 1,
    unitPrice: formatPeso(160),
    customization: "Less Sugar, Large",
    specialInstructions: "—",
  },
  {
    key: "12-102",
    line: 102,
    orderId: 12,
    queue: "012",
    cashier: "Juan Dela Cruz",
    type: "Dine-in",
    orderDate: "2026-11-03T14:22:00+08:00",
    status: "preparing",
    product: "Iced Spanish Latte",
    ingredient: "Oreo Biscuits",
    addon: "Yes",
    quantity: 1,
    unitPrice: formatPeso(25),
    customization: "—",
    specialInstructions: "—",
  },
  {
    key: "11-99",
    line: 99,
    orderId: 11,
    queue: "011",
    cashier: "Maria Santos",
    type: "Take-out",
    orderDate: "2026-11-03T14:10:00+08:00",
    status: "completed",
    product: "Matcha Latte",
    ingredient: "—",
    addon: "No",
    quantity: 1,
    unitPrice: formatPeso(140),
    customization: "Regular, Medium",
    specialInstructions: "—",
  },
];

function flattenOrders(orders: Order[]): OrderLineRow[] {
  return orders.flatMap((order) => {
    let parentProduct = "—";
    return [...order.items]
      .sort((a, b) => a.lineId - b.lineId)
      .map((item) => {
        if (!item.isAddon) parentProduct = item.name ?? "—";
        return {
          key: `${order.orderId}-${item.lineId}`,
          line: item.lineId,
          orderId: order.orderId,
          queue: String(order.orderId).padStart(3, "0"),
          cashier: order.cashierName ?? "—",
          type:
            order.orderType === "dine-in"
              ? "Dine-in"
              : order.orderType === "take-out"
                ? "Take-out"
                : order.orderType === "pre-order"
                  ? "Pre-order"
                  : "—",
          orderDate: order.orderDate,
          status: order.status,
          product: item.isAddon ? parentProduct : (item.name ?? "—"),
          ingredient: item.isAddon ? (item.name ?? "—") : "—",
          addon: item.isAddon ? "Yes" : "No",
          quantity: item.quantity,
          unitPrice: formatPeso(item.unitPrice),
          customization: item.customization ?? "—",
          specialInstructions: item.specialInstructions ?? "—",
        };
      });
  });
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

/** Owner order board (SDS UI 593, FR-10). Orders are taken on the POS only. */
export default function OrdersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState("");
  const orders = useLiveQuery(
    ["orders", statusFilter, dateFilter],
    () =>
      listOrders({
        status: statusFilter,
        date: dateFilter || undefined,
      }),
    { enabled: !USE_MOCKS },
  );

  const allRows = USE_MOCKS ? sampleRows : flattenOrders(orders.data ?? []);
  const rows = useMemo(
    () =>
      allRows.filter(
        (row) =>
          queueMatches(row.queue, search) &&
          (statusFilter === "all" || row.status === statusFilter) &&
          (!dateFilter ||
            BUSINESS_DATE_FORMATTER.format(new Date(row.orderDate)) ===
              dateFilter),
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
        USE_MOCKS ? (
          formatQueueNumber(row.queue)
        ) : (
          <Link
            href={`/orders/${row.orderId}`}
            className="order-queue-link"
            aria-label={`View details for order ${formatQueueNumber(row.queue)}`}
          >
            {formatQueueNumber(row.queue)}
          </Link>
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
    <div className="space-y-5">
      <header>
        <p className="mb-1 text-sm text-gray-500">Gunita · Order Board</p>
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
      </header>

      <section
        aria-label="Order filters"
        className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_10rem_10rem_auto]"
      >
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
            <option value="all">All Statuses</option>
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
          Clear Date
        </Button>
      </section>

      {orders.error && !USE_MOCKS && (
        <p role="alert" className="text-sm text-red-700">
          {orders.error instanceof Error
            ? orders.error.message
            : "Could not load orders."}
        </p>
      )}
      {!USE_MOCKS && orders.isLoading && <p role="status">Loading orders…</p>}

      <DataTable<OrderLineRow>
        className="tbl-orders"
        columns={columns}
        data={rows}
        emptyMessage={
          orders.error && !USE_MOCKS
            ? "Orders could not be loaded."
            : "No orders match these filters."
        }
        keyExtractor={(row) => row.key}
      />
    </div>
  );
}
