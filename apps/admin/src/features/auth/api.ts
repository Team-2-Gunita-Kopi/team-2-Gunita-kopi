import { decodeJwtPayload, type MockSession } from "@gunita/auth";
import { supabaseBrowser } from "@/lib/supabase-browser";

export async function signIn(identifier: string, password: string): Promise<MockSession> {
  const { data, error } = await supabaseBrowser.auth.signInWithPassword({ email: identifier, password });
  if (error || !data.session) throw new Error(error?.message ?? "Incorrect username or password.");
  const payload = decodeJwtPayload(data.session.access_token);
  const role = payload?.app_metadata?.role;
  if (role !== "owner_admin" && role !== "barista") throw new Error("Incorrect username or password.");
  return {
    userId: data.session.user.id,
    role,
    fullName: payload?.user_metadata?.full_name ?? identifier,
    username: identifier,
  };
}

export async function signOut(): Promise<void> {
  await supabaseBrowser.auth.signOut();
}

export function getSession(): MockSession | null {
  return null; // The Supabase session is read via supabaseBrowser.auth.getSession().
}

export interface RegisterOwnerRequest {
  fullName: string;
  email: string;
  username: string;
  password: string;
}

/** Supabase emails a recovery OTP (the "Reset password" template must include {{ .Token }}). */
export async function requestPasswordRecovery(email: string): Promise<void> {
  const { error } = await supabaseBrowser.auth.resetPasswordForEmail(email);
  if (error) throw new Error(error.message);
}

export async function verifyRecoveryCode(email: string, code: string): Promise<void> {
  const { error } = await supabaseBrowser.auth.verifyOtp({ email, token: code, type: "recovery" });
  if (error) throw new Error("That recovery code is invalid or has expired.");
}

/** Runs after verifyRecoveryCode, which signed the user in with a recovery session. */
export async function resetPassword(_email: string, _code: string, password: string): Promise<void> {
  const { error } = await supabaseBrowser.auth.updateUser({ password });
  if (error) throw new Error(error.message);
  await supabaseBrowser.auth.signOut();
}

/** The Owner role is granted server-side; sign-up only creates the auth user. */
export async function registerOwner(req: RegisterOwnerRequest): Promise<void> {
  const { error } = await supabaseBrowser.auth.signUp({
    email: req.email,
    password: req.password,
    options: { data: { full_name: req.fullName, username: req.username } },
  });
  if (error) throw new Error(error.message);
}
