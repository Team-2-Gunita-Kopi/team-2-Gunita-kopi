import { DashboardStatsSchema, ReportSchema, type DashboardStats, type ReportType } from "@gunita/contracts";
import { apiData } from "@/lib/api-client";

// FR-30 to FR-35: Owner-only reports from the database views.
export const getReport = (type: ReportType, query = "") =>
  apiData(`/api/reports/${type}${query ? `?${query}` : ""}`, ReportSchema);

// FR-36 to FR-39: dashboard summary.
export const getDashboard = (): Promise<DashboardStats> => apiData("/api/dashboard", DashboardStatsSchema);

/** Rows to CSV (RFC 4180 quoting) for the Export CSV button. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]!);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => cell(r[k])).join(","))].join("\n");
}
