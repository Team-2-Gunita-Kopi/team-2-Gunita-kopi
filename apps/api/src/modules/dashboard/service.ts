import { DashboardStats } from "./schema";
import { AuthenticatedUser } from "@/lib/auth";
import { NotImplementedError } from "@/lib/errors";

export async function getDashboardStats(
  _user: AuthenticatedUser,
): Promise<DashboardStats> {
  // TODO: Aggregate metrics across sales, order counts, and stock alert views
  throw new NotImplementedError(
    "Dashboard statistics service is not implemented yet.",
  );
}
