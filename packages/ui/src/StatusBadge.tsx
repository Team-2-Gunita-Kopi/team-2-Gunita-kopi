import React from "react";

export type BadgeVariant =
  | "pending"
  | "preparing"
  | "completed"
  | "cancelled"
  | "low_stock"
  | "synced"
  | "syncing"
  | "failed"
  | "neutral";

export interface StatusBadgeProps {
  status: string;
  variant?: BadgeVariant;
  label?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant,
  label,
}) => {
  const displayLabel = label || status.replace(/_/g, " ");
  const effectiveVariant: BadgeVariant =
    variant ||
    (status === "low_stock"
      ? "low_stock"
      : status === "completed" || status === "synced"
        ? "completed"
        : status === "preparing" || status === "syncing"
          ? "preparing"
          : status === "cancelled" || status === "failed"
            ? "cancelled"
            : status === "pending"
              ? "pending"
              : "neutral");

  const variantStyles: Record<BadgeVariant, string> = {
    // Warm colored tags for low stock as required by design specification
    low_stock:
      "bg-amber-100 text-amber-900 border border-amber-300 font-medium",
    pending: "bg-yellow-50 text-yellow-800 border border-yellow-200",
    preparing: "bg-blue-50 text-blue-800 border border-blue-200",
    completed:
      "bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium",
    cancelled: "bg-red-50 text-red-800 border border-red-200",
    synced: "bg-emerald-50 text-emerald-800 border border-emerald-200",
    syncing:
      "bg-indigo-50 text-indigo-800 border border-indigo-200 animate-pulse",
    failed: "bg-red-50 text-red-800 border border-red-200 font-medium",
    neutral: "bg-gray-100 text-gray-700 border border-gray-200",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs capitalize ${variantStyles[effectiveVariant]}`}
    >
      {displayLabel}
    </span>
  );
};
