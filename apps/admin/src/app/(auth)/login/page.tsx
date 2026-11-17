"use client";

import React, { useState } from "react";
import { Button, Input } from "@gunita/ui";
import { apiClient } from "@/lib/api-client";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    try {
      // This site's server signs in through the API and sets an HttpOnly session cookie.
      const res = await apiClient<null>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      if (!res.success) {
        setErrorMessage(res.error?.message ?? "Sign in failed");
        return;
      }

      // TODO: Implement Multi-Factor Authentication (MFA) challenge verification for owner_admin accounts

      window.location.href = "/dashboard";
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#0F2F24] text-white font-bold text-xl mb-3">
            GK
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Owner Portal
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Gunita Kopi Management & Inventory
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            label="Username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="owner username"
          />

          <Input
            label="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          <Button type="submit" className="w-full mt-2" disabled={isLoading}>
            {isLoading ? "Signing In..." : "Sign In as Owner"}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs">
          <a href="/forgot-password" className="text-[#0F2F24] underline">
            Forgot password?
          </a>
        </p>

        <p className="mt-4 text-center text-xs text-gray-400">
          Private authorized access only. Registration is handled internally.
        </p>
      </div>
    </div>
  );
}
