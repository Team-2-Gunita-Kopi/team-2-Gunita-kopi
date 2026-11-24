import { supabaseAdmin } from "./supabase-admin";
import { CreateAuditEvent } from "@/contracts";
import { Json } from "@/db-types";
import { logger } from "./logger";

/**
 * Records an audit log event using the privileged service role client.
 * Audit logs cannot be read or modified by users or baristas (no RLS policies on audit_logs).
 */
export async function logAuditEvent(event: CreateAuditEvent): Promise<void> {
  logger.info("Audit event logged", {
    action: event.action,
    userId: event.userId,
    userRole: event.userRole,
    resource: event.resource,
    resourceId: event.resourceId,
  });

  const { error } = await supabaseAdmin.from("audit_logs").insert({
    action: event.action,
    user_id: event.userId,
    user_role: event.userRole,
    resource: event.resource,
    resource_id: event.resourceId ?? null,
    details: (event.details ?? null) as Json,
    ip_address: event.ipAddress ?? null,
    user_agent: event.userAgent ?? null,
  });

  // An audit write failure must not undo the action already performed; log it loudly instead.
  if (error) {
    logger.error("Audit log insert failed", {
      action: event.action,
      error: error.message,
    });
  }
}

/** Audit entry for a privileged action by the signed-in user (NFR-11). */
export function auditAction(
  user: { id: string; role: string },
  action: string,
  resource: string,
  resourceId: number | string,
  details?: object,
): Promise<void> {
  return logAuditEvent({
    action,
    userId: user.id,
    userRole: user.role,
    resource,
    resourceId: String(resourceId),
    details: details ? { ...details } : undefined,
  });
}
