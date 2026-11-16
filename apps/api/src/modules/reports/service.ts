import { ReportType } from "./schema";
import { AuthenticatedUser } from "@/lib/auth";
import { NotImplementedError } from "@/lib/errors";

export async function generateReport(
  _user: AuthenticatedUser,
  _type: ReportType,
): Promise<unknown> {
  // TODO: Query corresponding database view (v_daily_sales, v_monthly_sales, v_best_sellers, v_inventory_status)
  throw new NotImplementedError(
    `Report generator for type '${_type}' is not implemented yet.`,
  );
}
