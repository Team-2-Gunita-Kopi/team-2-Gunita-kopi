"use client";

import React, { useState } from "react";
import { Button, Input } from "@gunita/ui";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function PosLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      if (data?.session) {
        window.location.href = "/pos";
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#091A14] px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0F2F24] text-white font-bold text-2xl mb-3 shadow-md">
            GK
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Barista Terminal
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Gunita Kopi Offline-First POS
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            label="Barista Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="barista@gunitakopi.com"
          />

          <Input
            label="PIN / Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          <Button type="submit" className="w-full mt-2" disabled={isLoading}>
            {isLoading ? "Opening Register..." : "Open Register"}
          </Button>
        </form>

        <div className="mt-6 text-center text-xs text-gray-400">
          Authorized Gunita Kopi Staff Only
        </div>
      </div>
    </div>
  );
}
