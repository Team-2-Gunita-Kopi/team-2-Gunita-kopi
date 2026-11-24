import { z } from "zod";

export const RoleSchema = z.enum(["owner_admin", "barista"]);
export type Role = z.infer<typeof RoleSchema>;

export const ROLES = {
  OWNER_ADMIN: "owner_admin" as const,
  BARISTA: "barista" as const,
} as const;
