"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";

export interface LoginFormProps {
  roleLabel: "Owner" | "Barista";
  /** Resolves to an error message, or null on success. */
  onSubmit: (identifier: string, password: string) => Promise<string | null>;
  /** Shows a "Forgot password?" link when provided. */
  onForgotPassword?: () => void;
  /** Shows a "Create account" link when provided. */
  onCreateAccount?: () => void;
  /** Success message shown above the form (e.g. after a password reset). */
  notice?: string;
}

const MAX_FAILS = 5;
const LOCK_MS = 30000;

export const LoginForm: React.FC<LoginFormProps> = ({ roleLabel, onSubmit, onForgotPassword, onCreateAccount, notice }) => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fails = useRef(0);
  const lockUntil = useRef(0);
  const userRef = useRef<HTMLInputElement>(null);
  // Baristas have no email (username only); copy follows the Staff POS Figma login.
  const staff = roleLabel === "Barista";

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const now = Date.now();
    if (now < lockUntil.current) {
      setError(`Too many attempts — try again in ${Math.ceil((lockUntil.current - now) / 1000)} s.`);
      return;
    }
    setLoading(true);
    setError("");
    let result: string | null;
    try {
      result = await onSubmit(identifier.trim(), password);
    } catch {
      result = "Something went wrong. Please try again.";
    }
    setLoading(false);
    if (result === null) {
      fails.current = 0;
      return;
    }
    fails.current++;
    if (fails.current >= MAX_FAILS) {
      lockUntil.current = Date.now() + LOCK_MS;
      fails.current = 0;
      setError("Too many attempts — locked for 30 s.");
    } else {
      setError(result);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card card" onSubmit={submit} noValidate>
        <div className="login-brand">
          <img className="login-logo" src="/brand/gunita-kopi-logo.png" alt="Gunita Kopi" width={564} height={310} />
          <span className="brand-sub">{staff ? "POS System · Staff Sign-in" : `${roleLabel} Sign-in`}</span>
        </div>
        {notice ? (
          <div className="login-notice" role="status">
            {notice}
          </div>
        ) : null}
        <label className="field">
          {staff ? "Username" : "Email or username"}
          <input
            ref={userRef}
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </label>
        <label className="field">
          Password
          <span className="pw-wrap">
            <input
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="pw-eye"
              aria-label={showPw ? "Hide password" : "Show password"}
              onClick={() => setShowPw((v) => !v)}
            >
              <Icon name={showPw ? "eyeOff" : "eye"} />
            </button>
          </span>
        </label>
        <div className="field-err" role="alert">
          {error}
        </div>
        <Button type="submit" variant="primary" block disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
        {onForgotPassword || onCreateAccount ? (
          <div className="login-links">
            {onForgotPassword ? (
              <button type="button" className="login-link" onClick={onForgotPassword}>
                Forgot password?
              </button>
            ) : (
              <span />
            )}
            {onCreateAccount ? (
              <button type="button" className="login-link" onClick={onCreateAccount}>
                Create account
              </button>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>
  );
};
