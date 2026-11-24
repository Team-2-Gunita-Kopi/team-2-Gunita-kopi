import { z } from "zod";
import { RoleSchema } from "./roles";

export const CreateEmployeeRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2, "Full name is required"),
  role: RoleSchema,
  phone: z.string().optional(),
});
export type CreateEmployeeRequest = z.infer<typeof CreateEmployeeRequestSchema>;

export const EmployeeResponseSchema = z.object({
  id: z.string(),
  authUserId: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  role: RoleSchema,
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type EmployeeResponse = z.infer<typeof EmployeeResponseSchema>;
