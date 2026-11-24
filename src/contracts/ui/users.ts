import { z } from "zod";
import { RoleSchema } from "./roles";

export const UserProfileSchema = z.object({
  id: z.string(),
  authUserId: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  username: z.string().optional(),
  role: RoleSchema,
  phone: z.string().optional(),
  isActive: z.boolean(),
  lastSignInAt: z.string().optional(),
  createdAt: z.string(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;
