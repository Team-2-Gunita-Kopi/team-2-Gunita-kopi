"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@gunita/ui";
import { signOut, startMfa, verifyMfa, type MfaStart } from "@/features/auth";
import { safeRedirect } from "@/lib/safe-redirect";

/**
 * Second sign-in step for the Owner (SDS 2.4, 2.8). The middleware sends every Owner session
 * without it here. First time: scan the QR code with an authenticator app, then enter its code.
 */
export default function MfaPage() {
  const router = useRouter();
  const [start, setStart] = useState<MfaStart | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Once per page: each start replaces an unfinished setup with a new QR code.
    if (started.current) return;
    started.current = true;
    startMfa()
      .then(setStart)
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "Could not start the second step.",
        ),
      );
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim()))
      return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true);
    setError("");
    try {
      await verifyMfa(
        code.trim(),
        start?.step === "enroll" ? start.factorId : undefined,
      );
      if (start?.step === "enroll") {
        // First setup done: end this session; the Owner signs in again with password and code.
        await signOut().catch(() => undefined);
        router.replace("/login?notice=mfa_enabled");
        return;
      }
      router.replace(
        safeRedirect(
          new URLSearchParams(window.location.search).get("redirect"),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code is not valid.");
      setBusy(false);
    }
  };

  const cancel = async () => {
    await signOut().catch(() => undefined);
    router.replace("/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Second Sign-in Step
        </h1>
        {start?.step === "enroll" && (
          <div className="mb-4 space-y-2 text-sm text-gray-700">
            <p>
              Scan this QR code with an authenticator app, then enter the
              6-digit code it shows.
            </p>
            <img
              src={start.qrCode}
              alt="Authenticator setup QR code"
              className="w-48 h-48 mx-auto"
            />
            <p className="text-xs break-all">
              Or enter this key: <code>{start.secret}</code>
            </p>
          </div>
        )}
        {start?.step === "verify" && (
          <p className="mb-4 text-sm text-gray-700">
            Enter the 6-digit code from your authenticator app.
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg"
          >
            {error}
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Authentication Code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={busy || !start}>
            {busy ? "Checking..." : "Verify"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => void cancel()}
          className="block mt-4 text-xs text-[#0F2F24] underline"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
