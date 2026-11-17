"use client";

import React, { useState } from "react";
import { Button, Input } from "@gunita/ui";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Landing page of the Supabase recovery link. The browser client reads the recovery
 * session from the URL (detectSessionInUrl), then the Owner sets a new password.
 */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMessage("Passwords do not match");
      return;
    }
    setIsLoading(true);
    const { error } = await supabaseBrowser.auth.updateUser({ password });
    setIsLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    await supabaseBrowser.auth.signOut();
    setDone(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-4">
          Choose a New Password
        </h1>
        {done ? (
          <p className="text-sm text-gray-700">
            Password updated.{" "}
            <a href="/login" className="text-[#0F2F24] underline">
              Sign in with your username
            </a>
            .
          </p>
        ) : (
          <>
            {message && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {message}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="New Password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Input
                label="Confirm Password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Saving..." : "Save Password"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
