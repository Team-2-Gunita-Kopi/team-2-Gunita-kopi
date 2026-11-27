import {
  DashboardStatsSchema,
  ReportPrintInfoSchema,
  ReportSchema,
  type DashboardStats,
  type ReportPrintInfo,
  type ReportPrintRequest,
  type ReportType,
} from "@/contracts";
import { apiData } from "@/owner/lib/api-client";
import { USE_MOCKS } from "@/owner/lib/use-mocks";
import { getSession as getDemoSession } from "@/owner/features/auth/mock";

// FR-30 to FR-35: Owner-only reports from the database views.
export const getReport = (type: ReportType, query = "") =>
  apiData(`/api/reports/${type}${query ? `?${query}` : ""}`, ReportSchema);

/**
 * Print Report: the server issues the report ID, reads the preparer from the session and writes the
 * report_prepared_for_print audit entry.
 */
export async function prepareReportPrint(type: ReportType, body: ReportPrintRequest): Promise<ReportPrintInfo> {
  if (USE_MOCKS) {
    // shortcut: demo mode has no audit log and no server session for reports; uses the demo sign-in cookie.
    const demo = getDemoSession();
    return {
      reportId: `DEMO-${Date.now().toString(36).toUpperCase()}`,
      preparedAt: new Date().toISOString(),
      preparedBy: { fullName: demo?.fullName ?? "", username: demo?.username ?? "", role: demo?.role ?? "" },
      ownerName: demo?.fullName ?? null,
    };
  }
  return apiData(`/api/reports/${type}`, ReportPrintInfoSchema, { method: "POST", body: JSON.stringify(body) });
}

// FR-36 to FR-39: dashboard summary.
export const getDashboard = (): Promise<DashboardStats> => apiData("/api/dashboard", DashboardStatsSchema);
