import { DashboardStatsSchema, ReportSchema, type DashboardStats, type ReportType } from "@/contracts";
import { apiData } from "@/owner/lib/api-client";

// FR-30 to FR-35: Owner-only reports from the database views.
export const getReport = (type: ReportType, query = "") =>
  apiData(`/api/reports/${type}${query ? `?${query}` : ""}`, ReportSchema);

// FR-36 to FR-39: dashboard summary.
export const getDashboard = (): Promise<DashboardStats> => apiData("/api/dashboard", DashboardStatsSchema);

/**
 * Rows to CSV (RFC 4180 quoting) for the Export CSV button. `columns` picks and names the columns
 * (the table's headers); without it every key of the first row is used.
 */
export function toCsv(rows: Record<string, unknown>[], columns?: { key: string; header: string }[]): string {
  if (rows.length === 0) return "";
  const cols = columns ?? Object.keys(rows[0]!).map((key) => ({ key, header: key }));
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => cell(c.header)).join(","), ...rows.map((r) => cols.map((c) => cell(r[c.key])).join(","))].join("\r\n");
}

/**
 * Saves `csv` as a file. The BOM makes Excel read UTF-8 (₱); the link is attached for Firefox and
 * the object URL is released only after the download has started.
 */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
