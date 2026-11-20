"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { EmailCodeForm, ForgotPasswordForm, LoginForm } from "@gunita/ui";
import {
  requestPasswordRecovery,
  resendSignInCode,
  resetPassword,
  signIn,
  verifyRecoveryCode,
  verifySignInCode,
} from "@/features/auth";
import { safeRedirect } from "@/lib/safe-redirect";

type View = "login" | "code" | "forgot";

// The Owner account is provisioned by the developer (scripts/provision-owner.mjs); there is no
// registration here.
export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("login");
  const [notice, setNotice] = useState("");

  const backToLogin = (message = "") => {
    setNotice(message);
    setView("login");
  };

  const goToTarget = () =>
    router.replace(safeRedirect(new URLSearchParams(window.location.search).get("redirect")));

  const onSubmit = async (identifier: string, password: string): Promise<string | null> => {
    try {
      const session = await signIn(identifier, password);
      // Real mode: the password only starts sign-in; the emailed code finishes it (SDS 2.4).
      if ("otpRequired" in session && session.otpRequired === true) {
        setNotice("");
        setView("code");
        return null;
      }
    } catch (err) {
      return err instanceof Error ? err.message : "Sign in failed";
    }
    goToTarget();
    return null;
  };

  if (view === "code") {
    return (
      <EmailCodeForm
        onVerify={async (code) => {
          await verifySignInCode(code);
          goToTarget();
        }}
        onResend={resendSignInCode}
        onBack={() => backToLogin()}
      />
    );
  }

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

  return (
    <LoginForm
      roleLabel="Owner"
      onSubmit={onSubmit}
      notice={notice}
      onForgotPassword={() => {
        setNotice("");
        setView("forgot");
      }}
    />
  );
}
