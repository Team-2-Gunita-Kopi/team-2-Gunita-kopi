import { ROLES, type Role } from "@gunita/contracts";

export const MOCK_SESSION_COOKIE = "gk-mock-session";

export type MockSession = {
  userId: string;
  role: Role;
  fullName: string;
  username: string;
};

const VALID_ROLES: readonly string[] = Object.values(ROLES);

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** Encodes a mock session as base64url JSON (browser + edge safe). */
export function encodeMockSession(s: MockSession): string {
  return toBase64Url(JSON.stringify(s));
}

/** Decodes a mock session cookie; null on bad input or unknown role. */
export function decodeMockSession(v: string | undefined): MockSession | null {
  if (!v) return null;
  try {
    const raw: unknown = JSON.parse(fromBase64Url(v));
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    if (
      typeof r.userId !== "string" ||
      typeof r.fullName !== "string" ||
      typeof r.username !== "string" ||
      typeof r.role !== "string" ||
      !VALID_ROLES.includes(r.role)
    ) {
      return null;
    }
    return {
      userId: r.userId,
      role: r.role as Role,
      fullName: r.fullName,
      username: r.username,
    };
  } catch {
    return null;
  }
}
