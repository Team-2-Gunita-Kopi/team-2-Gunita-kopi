import { SyncPayload, SyncResponse } from "./schema";
import { AuthenticatedUser } from "@/lib/auth";
import { NotImplementedError } from "@/lib/errors";

export async function processSyncOrders(
  _user: AuthenticatedUser,
  _payload: SyncPayload,
): Promise<SyncResponse> {
  // TODO: Implement batch processing of offline orders using PostgreSQL RPC process_checkout_transaction
  throw new NotImplementedError(
    "Offline order sync service is not implemented yet.",
  );
}
