"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { LoginForm } from "@gunita/ui";
import { signIn } from "@/features/auth";

const HOME = "/dashboard";

/** Same-origin paths only: resolve against our origin and compare (handles "/\evil", tabs, etc.). */
function safeRedirect(value: string | null): string {
  if (!value) return HOME;
  try {
    const u = new URL(value, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search + u.hash : HOME;
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

  return <LoginForm roleLabel="Owner" onSubmit={onSubmit} />;
}
