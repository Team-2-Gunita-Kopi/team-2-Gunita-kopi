"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { LoginForm } from "@gunita/ui";
import { signIn } from "@/features/auth";

const HOME = "/pos";

/** Same-app relative paths only (no protocol-relative or absolute URLs). */
function safeRedirect(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : HOME;
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
