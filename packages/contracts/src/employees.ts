import { z } from "zod";
import { RoleSchema } from "./roles";

// Staff sign in with a username; it must also be valid as the local part of an email (see @gunita/auth).
export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9._-]{3,50}$/,
    "Username: 3-50 letters, numbers, dots, dashes or underscores",
  );

export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");
const FullNameSchema = z
  .string()
  .trim()
  .min(2, "Full name is required")
  .max(100);

// Owner creates barista accounts only. The single Owner/Admin account comes from the one-time setup.
export const CreateEmployeeRequestSchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
  fullName: FullNameSchema,
  role: z.literal("barista", {
    errorMap: () => ({ message: "Only barista accounts can be created here" }),
  }),
});
export type CreateEmployeeRequest = z.infer<typeof CreateEmployeeRequestSchema>;

export const EmployeeResponseSchema = z.object({
  id: z.string(),
  authUserId: z.string(),
  username: z.string(),
  fullName: z.string(),
  role: RoleSchema,
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type EmployeeResponse = z.infer<typeof EmployeeResponseSchema>;

// Real address for the Owner/Admin account (verification and password recovery). Baristas have none.
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email("Enter a valid email address");

// One-time Owner registration. No role field: the API always assigns owner_admin.
export const OwnerSetupRequestSchema = z
  .object({
    email: EmailSchema,
    fullName: FullNameSchema,
    username: UsernameSchema,
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
export type OwnerSetupRequest = z.infer<typeof OwnerSetupRequestSchema>;

export const OwnerSetupResponseSchema = EmployeeResponseSchema.extend({
  email: z.string(),
});
export type OwnerSetupResponse = z.infer<typeof OwnerSetupResponseSchema>;

// Username sign-in for every role; the Owner may also use their email. The API resolves the Auth
// identity; the browser never sees it.
export const LoginRequestSchema = z.object({
  username: z.union([
    UsernameSchema,
    z.string().trim().toLowerCase().email().max(254),
  ]),
  password: z.string().min(1, "Password is required"),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginSessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number().optional(),
});
export type LoginSession = z.infer<typeof LoginSessionSchema>;

// Barista: a session. Owner: no session yet, only a challenge for the emailed code (POST /api/auth/otp).
export const LoginResponseSchema = z.union([
  LoginSessionSchema,
  z.object({ otpRequired: z.literal(true), challenge: z.string() }),
]);
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

const OtpChallengeSchema = z.string().min(32).max(128);
export const OwnerOtpRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), challenge: OtpChallengeSchema }),
  z.object({
    action: z.literal("verify"),
    challenge: OtpChallengeSchema,
    code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  }),
]);
export type OwnerOtpRequest = z.infer<typeof OwnerOtpRequestSchema>;
