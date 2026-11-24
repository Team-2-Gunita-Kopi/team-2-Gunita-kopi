import { CreateAuditEvent } from "./schema";
import { logAuditEvent } from "@/server/lib/audit";

export async function recordAudit(event: CreateAuditEvent): Promise<void> {
  await logAuditEvent(event);
}
