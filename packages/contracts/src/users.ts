import { z } from "zod";
import { RoleSchema } from "./roles";
import { PaginationQuerySchema, StatusSchema } from "./common";

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
 * Only the name and the active status can change here. Role, username, email and the Auth link
 * are fixed (the database grants no update on them to signed-in users).
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
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export const UserListQuerySchema = PaginationQuerySchema.extend({
  role: RoleSchema.optional(),
  status: StatusSchema.optional(),
});
export type UserListQuery = z.infer<typeof UserListQuerySchema>;
