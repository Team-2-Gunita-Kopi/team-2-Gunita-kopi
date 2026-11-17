"use client";

import React, { useState } from "react";
import { Button, Input } from "@gunita/ui";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Owner password recovery by real email. Baristas have no email; the Owner resets theirs.
 * Supabase answers the same way whether or not the address exists.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");
    const { error } = await supabaseBrowser.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/reset-password` },
    );
    setIsLoading(false);
    if (error) setErrorMessage(error.message);
    else setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Reset Owner Password
        </h1>
        {sent ? (
          <p className="text-sm text-gray-700">
            If that email belongs to the Owner account, a reset link is on its
            way.
          </p>
        ) : (
          <>
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {errorMessage}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Owner Email Address"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Sending..." : "Send Reset Link"}
              </Button>
            </form>
            <p className="mt-4 text-xs text-gray-500">
              Baristas: ask the Owner to reset your password.
            </p>
          </>
        )}
        <a
          href="/login"
          className="block mt-4 text-xs text-[#0F2F24] underline"
        >
          Back to sign in
        </a>
      </div>
    </div>
  );
}
