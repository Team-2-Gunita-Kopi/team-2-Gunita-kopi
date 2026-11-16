import { ReceiptRequest, ReceiptResponse } from "./schema";
import { AuthenticatedUser } from "@/lib/auth";
import { NotImplementedError } from "@/lib/errors";

export async function createReceiptDownloadLink(
  _user: AuthenticatedUser,
  _data: ReceiptRequest,
): Promise<ReceiptResponse> {
  // TODO: Call user.supabaseClient.storage.from('receipts').createSignedUrl(filename, 3600)
  throw new NotImplementedError(
    "Receipt generation and signed storage link service is not implemented yet.",
  );
}
