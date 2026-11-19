import { UserProfileSchema, pageOf, type Status, type UserProfile } from "@gunita/contracts";
import { apiAllPages, apiData } from "@/lib/api-client";

// FR-49: staff accounts (Owner only). Accounts are created by POST /api/admin/employees.
export const listUsers = (): Promise<UserProfile[]> => apiAllPages("/api/users", pageOf(UserProfileSchema));

/** FR-45 to FR-47: deactivated accounts lose access on their next request (requireUser). */
export const setUserStatus = (id: number, status: Status): Promise<UserProfile> =>
  apiData(`/api/users/${id}`, UserProfileSchema, { method: "PATCH", body: JSON.stringify({ status }) });
