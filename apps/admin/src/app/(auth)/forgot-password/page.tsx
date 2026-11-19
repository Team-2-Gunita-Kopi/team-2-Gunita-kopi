"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ForgotPasswordForm } from "@gunita/ui";
import {
  requestPasswordRecovery,
  resetPassword,
  verifyRecoveryCode,
} from "@/features/auth";

/**
 * Owner password recovery by real email and a 6-digit code (same flow as "Forgot password" on the
 * sign-in page). Runs on this site's server; no recovery token reaches the browser.
 * Baristas have no email; the Owner resets theirs.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  return (
    <ForgotPasswordForm
      roleLabel="Owner"
      onRequestCode={requestPasswordRecovery}
      onVerifyCode={verifyRecoveryCode}
      onResetPassword={resetPassword}
      onDone={() => router.replace("/login")}
      onBack={() => router.replace("/login")}
    />
  );
}
