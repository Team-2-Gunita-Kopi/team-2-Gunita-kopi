import React from "react";
import { ORDER_STATUS_LABEL, STOCK_STATUS_LABEL } from "@gunita/contracts/ui";
import type { OrderStatus, StockStatus } from "@gunita/contracts/ui";
import { Chip, type ChipTone } from "./Chip";

const TONE: Record<string, ChipTone> = {
  // orders
  pending: "low",
  preparing: "coffee",
  completed: "ok",
  cancelled: "out",
  // sync states
  synced: "ok",
  syncing: "coffee",
  failed: "out",
  // stock
  ok: "ok",
  low: "low",
  low_stock: "low",
  out_of_stock: "out",
};

const SYNC_LABEL: Record<string, string> = {
  pending: "Pending sync",
  synced: "Synced",
  syncing: "Syncing",
  failed: "Failed",
};

export interface StatusBadgeProps {
  status: string;
  label?: string;
  /** Legacy prop; the tone is derived from `status`. */
  variant?: string;
}

function defaultLabel(status: string): string {
  if (status in STOCK_STATUS_LABEL) return STOCK_STATUS_LABEL[status as StockStatus];
  if (status in ORDER_STATUS_LABEL) return ORDER_STATUS_LABEL[status as OrderStatus];
  if (status === "low_stock") return STOCK_STATUS_LABEL.low;
  return SYNC_LABEL[status] ?? status.replace(/_/g, " ");
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return <Chip tone={TONE[status] ?? "neutral"}>{label ?? defaultLabel(status)}</Chip>;
}
