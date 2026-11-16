import { z } from "zod";

export const AuditEventSchema = z.object({
  id: z.string(),
  action: z.string(),
  userId: z.string(),
  userRole: z.string(),
  resource: z.string(),
  resourceId: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  createdAt: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const CreateAuditEventSchema = z.object({
  action: z.string(),
  userId: z.string(),
  userRole: z.string(),
  resource: z.string(),
  resourceId: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});
export type CreateAuditEvent = z.infer<typeof CreateAuditEventSchema>;
