import { z } from "zod";
import { RoleSchema } from "./roles";
import { PaginationQuerySchema, StatusSchema } from "./common";
import { PasswordSchema, UsernameSchema } from "./employees";

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
 * The name, the username, the active status and a new password (set by the Owner) can change
 * here. Role, email and the Auth link are fixed; apps/api writes usernames with the service role.
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
    username: UsernameSchema.optional(),
    // Required (and checked by apps/api) when the Owner changes their own password.
    currentPassword: z.string().max(72).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export const UserListQuerySchema = PaginationQuerySchema.extend({
  role: RoleSchema.optional(),
  status: StatusSchema.optional(),
});
export type UserListQuery = z.infer<typeof UserListQuerySchema>;
