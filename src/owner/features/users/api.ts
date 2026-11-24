import { UserProfileSchema, pageOf, type Status, type UpdateUserRequest, type UserProfile } from "@/contracts";
import { apiAllPages, apiData } from "@/owner/lib/api-client";

// FR-49: staff accounts (Owner only). Accounts are created by POST /api/admin/employees.
export const listUsers = (): Promise<UserProfile[]> => apiAllPages("/api/users", pageOf(UserProfileSchema));

/** FR-45 to FR-47: deactivated accounts lose access on their next request (requireUser). */
export const setUserStatus = (id: number, status: Status): Promise<UserProfile> =>
  apiData(`/api/users/${id}`, UserProfileSchema, { method: "PATCH", body: JSON.stringify({ status }) });

/** FR-49: the Owner edits the full name, status and password; username and role are fixed. */
export const updateUser = (id: number, changes: UpdateUserRequest): Promise<UserProfile> =>
  apiData(`/api/users/${id}`, UserProfileSchema, { method: "PATCH", body: JSON.stringify(changes) });
