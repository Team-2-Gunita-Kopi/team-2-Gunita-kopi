import { z } from "zod";
import { RoleSchema } from "./roles";

export const UserProfileSchema = z.object({
  id: z.string(),
  authUserId: z.string(),
  // Owner/Admin only; NULL for baristas.
  email: z.string().email().nullable(),
  fullName: z.string(),
  role: RoleSchema,
  phone: z.string().optional(),
  isActive: z.boolean(),
  lastSignInAt: z.string().optional(),
  createdAt: z.string(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;
