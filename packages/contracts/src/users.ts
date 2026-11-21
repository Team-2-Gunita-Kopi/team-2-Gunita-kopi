import { z } from "zod";
import { RoleSchema } from "./roles";
import { PaginationQuerySchema, StatusSchema } from "./common";
import { PasswordSchema } from "./employees";

// USERS (FR-49). Passwords live in Supabase Auth only.
export const UserProfileSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  fullName: z.string(),
  role: RoleSchema,
  status: StatusSchema,
  // Owner/Admin only; NULL for baristas.
  email: z.string().nullable(),
  createdAt: z.string(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

/**
 * The name, the active status and a new password (set by the Owner) can change here. Role,
 * username, email and the Auth link are fixed (the database grants no update on them).
 */
export const UpdateUserRequestSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name is required")
      .max(100)
      .optional(),
    status: StatusSchema.optional(),
    password: PasswordSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export const UserListQuerySchema = PaginationQuerySchema.extend({
  role: RoleSchema.optional(),
  status: StatusSchema.optional(),
});
export type UserListQuery = z.infer<typeof UserListQuerySchema>;
