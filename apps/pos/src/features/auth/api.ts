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
