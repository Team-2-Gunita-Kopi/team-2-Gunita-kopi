"use client";

import React, { useState } from "react";
import { Button, Input } from "@gunita/ui";
import type { OwnerSetupResponse } from "@gunita/contracts";
import { apiClient } from "@/lib/api-client";

/**
 * One-time Owner/Admin registration. Works only while the API has OWNER_SETUP_TOKEN set
 * and no Owner exists. The role is assigned by the API; this form never sends one.
 */
export default function OwnerSetupPage() {
  const [form, setForm] = useState({
    setupCode: "",
    email: "",
    fullName: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [done, setDone] = useState<OwnerSetupResponse | null>(null);

  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    if (form.password !== form.confirmPassword) {
      setErrorMessage("Passwords do not match");
      return;
    }
    setIsLoading(true);
    try {
      const { setupCode, ...body } = form;
      const res = await apiClient<OwnerSetupResponse>("/api/setup/owner", {
        method: "POST",
        headers: { "X-Setup-Token": setupCode },
        body: JSON.stringify(body),
      });
      if (!res.success || !res.data) {
        setErrorMessage(res.error?.message ?? "Setup failed");
        return;
      }
      setDone(res.data);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Owner Account Setup
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            One-time registration for the Gunita Kopi owner
          </p>
        </div>

        {done ? (
          <div className="space-y-4 text-sm text-gray-700">
            <p>
              Owner account <strong>{done.username}</strong> created.
            </p>
            <p>
              {done.verificationEmailSent
                ? `We sent a confirmation link to ${done.email}. Open it, then sign in with your username.`
                : `The confirmation email could not be sent to ${done.email}. Use "Forgot password" on the sign-in page to get a new link.`}
            </p>
            <a href="/login" className="text-[#0F2F24] underline text-xs">
              Go to sign in
            </a>
          </div>
        ) : (
          <>
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {errorMessage}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Setup Code"
                type="password"
                autoComplete="off"
                required
                value={form.setupCode}
                onChange={set("setupCode")}
              />
              <Input
                label="Email Address"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={set("email")}
              />
              <Input
                label="Full Name"
                required
                value={form.fullName}
                onChange={set("fullName")}
              />
              <Input
                label="Username"
                autoComplete="username"
                required
                value={form.username}
                onChange={set("username")}
              />
              <Input
                label="Password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={form.password}
                onChange={set("password")}
              />
              <Input
                label="Confirm Password"
                type="password"
                autoComplete="new-password"
                required
                value={form.confirmPassword}
                onChange={set("confirmPassword")}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Owner Account"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
