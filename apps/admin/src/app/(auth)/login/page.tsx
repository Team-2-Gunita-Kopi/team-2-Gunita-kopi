"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CreateAccountForm, ForgotPasswordForm, LoginForm } from "@gunita/ui";
import { registerOwner, requestPasswordRecovery, resetPassword, signIn, verifyRecoveryCode } from "@/features/auth";
import { safeRedirect } from "@/lib/safe-redirect";

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
    let mfaRequired = false;
    try {
      const session = await signIn(identifier, password);
      mfaRequired = "mfaRequired" in session && session.mfaRequired === true;
    } catch (err) {
      return err instanceof Error ? err.message : "Sign in failed";
    }
    const target = safeRedirect(new URLSearchParams(window.location.search).get("redirect"));
    // SDS 2.4: the Owner finishes the second sign-in step before any page opens.
    router.replace(mfaRequired ? `/mfa?redirect=${encodeURIComponent(target)}` : target);
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
