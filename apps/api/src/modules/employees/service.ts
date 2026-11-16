import { CreateEmployeeRequest, EmployeeResponse } from "./schema";
import { AuthenticatedUser } from "@/lib/auth";
import { NotImplementedError } from "@/lib/errors";

export async function createEmployeeAccount(
  _currentUser: AuthenticatedUser,
  _data: CreateEmployeeRequest,
): Promise<EmployeeResponse> {
  // TODO: Call supabaseAdmin.auth.admin.createUser with app_metadata: { role: data.role }
  // and insert profile into users table
  throw new NotImplementedError(
    "Employee provisioning service is not implemented yet.",
  );
}
