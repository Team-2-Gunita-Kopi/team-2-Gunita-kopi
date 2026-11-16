import { supabaseAdmin as _supabaseAdmin } from "./supabase-admin";
import { CreateAuditEvent } from "@gunita/contracts";
import { logger } from "./logger";

/**
 * Records an audit log event using the privileged service role client.
 * Audit logs cannot be modified by users or baristas.
 */
export async function logAuditEvent(event: CreateAuditEvent): Promise<void> {
  logger.info("Audit event logged", {
    action: event.action,
    userId: event.userId,
    userRole: event.userRole,
    resource: event.resource,
    resourceId: event.resourceId,
  });

  // TODO: Insert audit log record into audit_logs table via supabaseAdmin once schema migration is applied
  // await supabaseAdmin.from('audit_logs').insert({
  //   action: event.action,
  //   user_id: event.userId,
  //   user_role: event.userRole,
  //   resource: event.resource,
  //   resource_id: event.resourceId,
  //   details: event.details as any,
  //   ip_address: event.ipAddress,
  //   user_agent: event.userAgent
  // });
}
