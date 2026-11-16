import { UserProfile } from "./schema";
import { AuthenticatedUser } from "@/lib/auth";
import { NotImplementedError } from "@/lib/errors";

export async function listUsers(
  _user: AuthenticatedUser,
): Promise<UserProfile[]> {
  // TODO: Query users table via user.supabaseClient
  throw new NotImplementedError("List users service is not implemented yet.");
}
