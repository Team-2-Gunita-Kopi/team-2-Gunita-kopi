"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CreateAccountForm, ForgotPasswordForm, LoginForm } from "@gunita/ui";
import { registerOwner, requestPasswordRecovery, resetPassword, signIn, verifyRecoveryCode } from "@/features/auth";

const HOME = "/dashboard";

/** Same-origin paths only: resolve against our origin and compare (handles "/\evil", tabs, etc.). */
function safeRedirect(value: string | null): string {
  if (!value) return HOME;
  try {
    const u = new URL(value, window.location.origin);
    if (u.origin !== window.location.origin) return HOME;
    const path = u.pathname + u.search + u.hash;
    // "//host" would be protocol-relative; "/login" would loop back here.
    return path.startsWith("//") || path.startsWith("/login") ? HOME : path;
  } catch {
    return HOME;
  }
}

type View = "login" | "forgot" | "create";

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("login");
  const [notice, setNotice] = useState("");

  const backToLogin = (message = "") => {
    setNotice(message);
    setView("login");
  };

  const onSubmit = async (identifier: string, password: string): Promise<string | null> => {
    try {
      await signIn(identifier, password);
    } catch (err) {
      return err instanceof Error ? err.message : "Sign in failed";
    }
    router.replace(safeRedirect(new URLSearchParams(window.location.search).get("redirect")));
    return null;
  };

  if (view === "forgot") {
    return (
      <ForgotPasswordForm
        roleLabel="Owner"
        onRequestCode={requestPasswordRecovery}
        onVerifyCode={verifyRecoveryCode}
        onResetPassword={resetPassword}
        onDone={() => backToLogin("Password updated. Sign in with your new password.")}
        onBack={() => backToLogin()}
      />
    );
  }

  if (view === "create") {
    return (
      <CreateAccountForm
        onCreate={registerOwner}
        onDone={() => backToLogin("Account created. You can now sign in.")}
        onBack={() => backToLogin()}
      />
    );
  }

  return (
    <LoginForm
      roleLabel="Owner"
      onSubmit={onSubmit}
      notice={notice}
      onForgotPassword={() => {
        setNotice("");
        setView("forgot");
      }}
      onCreateAccount={() => {
        setNotice("");
        setView("create");
      }}
    />
  );
}
