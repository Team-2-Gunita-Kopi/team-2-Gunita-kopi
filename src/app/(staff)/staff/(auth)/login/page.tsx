"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { LoginForm } from "@/ui";
import { signIn } from "@/staff/features/auth";

const HOME = "/staff/pos";

/** Same-origin paths only: resolve against our origin and compare (handles "/\evil", tabs, etc.). */
function safeRedirect(value: string | null): string {
  if (!value) return HOME;
  try {
    const u = new URL(value, window.location.origin);
    if (u.origin !== window.location.origin) return HOME;
    const path = u.pathname + u.search + u.hash;
    // "//host" would be protocol-relative; "/staff/login" would loop back here.
    // Only pages of the POS area (one app hosts both areas); "/staff/login" would loop back.
    return path.startsWith("/staff/") && !path.startsWith("/staff/login") ? path : HOME;
  } catch {
    return HOME;
  }
}

export default function LoginPage() {
  const router = useRouter();

  const onSubmit = async (identifier: string, password: string): Promise<string | null> => {
    try {
      await signIn(identifier, password);
    } catch (err) {
      return err instanceof Error ? err.message : "Sign in failed";
    }
    router.replace(safeRedirect(new URLSearchParams(window.location.search).get("redirect")));
    return null;
  };

  return <LoginForm roleLabel="Barista" onSubmit={onSubmit} />;
}
