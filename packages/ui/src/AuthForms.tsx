"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function run(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.";
  }
}

const Brand: React.FC<{ sub?: string }> = ({ sub }) => (
  <div className="login-brand">
    <span className="login-baybayin" lang="tl-Tglg" aria-hidden="true">
      ᜄᜓᜈᜒᜆ ᜃᜓᜉᜒ
    </span>
    <span className="brand-word">Gunita Kopi</span>
    {sub ? <span className="brand-sub">{sub}</span> : null}
  </div>
);

const BackLink: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <button type="button" className="login-link login-back" onClick={onBack}>
    ← Back to sign in
  </button>
);

const PasswordInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}> = ({ label, value, onChange, autoComplete }) => {
  const [show, setShow] = useState(false);
  return (
    <label className="field">
      {label}
      <span className="pw-wrap">
        <input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="pw-eye"
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          onClick={() => setShow((v) => !v)}
        >
          <Icon name={show ? "eyeOff" : "eye"} />
        </button>
      </span>
    </label>
  );
};

function useAutoFocus<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [dep]);
  return ref;
}

// ---------------------------------------------------------------------------

export interface ForgotPasswordFormProps {
  roleLabel: "Owner" | "Barista";
  /** Sends a recovery code. Should resolve even for unknown emails so accounts can't be probed. */
  onRequestCode: (email: string) => Promise<void>;
  /** Rejects with a message when the code is wrong or expired. */
  onVerifyCode: (email: string, code: string) => Promise<void>;
  onResetPassword: (email: string, code: string, password: string) => Promise<void>;
  /** Called after a successful reset. */
  onDone: () => void;
  onBack: () => void;
}

type ForgotStep = "email" | "code" | "password";

export const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({
  roleLabel,
  onRequestCode,
  onVerifyCode,
  onResetPassword,
  onDone,
  onBack,
}) => {
  const [step, setStep] = useState<ForgotStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const firstRef = useAutoFocus<HTMLInputElement>(step);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    const trimmed = email.trim();
    let err: string | null = null;
    if (step === "email") {
      if (!EMAIL_RE.test(trimmed)) return setError("Enter a valid email address.");
      setLoading(true);
      err = await run(() => onRequestCode(trimmed));
      if (!err) setStep("code");
    } else if (step === "code") {
      if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code from your email.");
      setLoading(true);
      err = await run(() => onVerifyCode(trimmed, code.trim()));
      if (!err) setStep("password");
    } else {
      if (password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      if (password !== confirm) return setError("Passwords do not match.");
      setLoading(true);
      err = await run(() => onResetPassword(trimmed, code.trim(), password));
      if (!err) {
        setLoading(false);
        return onDone();
      }
    }
    setLoading(false);
    if (err) setError(err);
  };

  const sub = step === "email" ? "Forgot password" : step === "code" ? "Check your email" : "New password";
  const cta = step === "email" ? "Send recovery link" : step === "code" ? "Continue" : "Save new password";

  return (
    <div className="login-wrap">
      <form className="login-card card" onSubmit={submit} noValidate>
        <Brand sub={sub} />
        {step === "email" ? (
          <>
            <p className="login-help">Enter the email address associated with your {roleLabel} account.</p>
            <label className="field">
              Email address
              <input
                ref={firstRef}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          </>
        ) : step === "code" ? (
          <>
            <p className="login-help">
              If <strong>{email.trim()}</strong> belongs to an {roleLabel} account, a recovery code has been sent. It
              expires in 15 minutes.
            </p>
            <label className="field">
              Recovery code
              <input
                ref={firstRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </label>
          </>
        ) : (
          <>
            <PasswordInput
              label={`New password (min ${MIN_PASSWORD} chars)`}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
            <PasswordInput label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          </>
        )}
        <div className="field-err" role="alert">
          {error}
        </div>
        <Button type="submit" variant="primary" block disabled={loading}>
          {loading ? "Please wait…" : cta}
        </Button>
        <BackLink onBack={onBack} />
      </form>
    </div>
  );
};

// ---------------------------------------------------------------------------

export interface CreateAccountValues {
  fullName: string;
  email: string;
  username: string;
  password: string;
  setupCode?: string;
}

export interface CreateAccountFormProps {
  /** Rejects with a message on failure (e.g. registration closed, username taken). */
  onCreate: (values: CreateAccountValues) => Promise<string | void>;
  /** Called after the account is created. */
  onDone: (message?: string) => void;
  onBack: () => void;
  requiresSetupCode?: boolean;
}

export const CreateAccountForm: React.FC<CreateAccountFormProps> = ({
  onCreate,
  onDone,
  onBack,
  requiresSetupCode = false,
}) => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const nameRef = useAutoFocus<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const values = {
      fullName: fullName.trim(),
      email: email.trim(),
      username: username.trim(),
      password,
      ...(requiresSetupCode ? { setupCode: setupCode.trim() } : {}),
    };
    if (values.fullName.length < 2) return setError("Full name is required.");
    if (!EMAIL_RE.test(values.email)) return setError("Enter a valid email address.");
    if (!values.username) return setError("Username is required.");
    if (requiresSetupCode && !values.setupCode) return setError("Setup code is required.");
    if (password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError("Passwords do not match.");
    setError("");
    setLoading(true);
    let successMessage: string | void = undefined;
    const err = await run(async () => {
      successMessage = await onCreate(values);
    });
    setLoading(false);
    if (err) return setError(err);
    onDone(typeof successMessage === "string" ? successMessage : undefined);
  };

  return (
    <div className="login-wrap">
      <form className="login-card card" onSubmit={submit} noValidate>
        <Brand sub="Create account" />
        <label className="field">
          Full name
          <input ref={nameRef} type="text" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="field">
          Email address
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Username
          <input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        {requiresSetupCode && (
          <label className="field">
            Setup code
            <input
              type="password"
              autoComplete="off"
              value={setupCode}
              onChange={(e) => setSetupCode(e.target.value)}
            />
          </label>
        )}
        <PasswordInput
          label={`Password (min ${MIN_PASSWORD} chars)`}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <PasswordInput label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <div className="field-err" role="alert">
          {error}
        </div>
        <Button type="submit" variant="primary" block disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </Button>
        <p className="login-fine">Initial Owner registration only. Registration closes after setup.</p>
        <BackLink onBack={onBack} />
      </form>
    </div>
  );
};

// ---------------------------------------------------------------------------

export interface EmailCodeFormProps {
  /** Rejects with a message when the code is wrong, expired or over the attempt limit. */
  onVerify: (code: string) => Promise<void>;
  /** Emails a new code; rejects with a message (for example "wait a minute"). */
  onResend: () => Promise<void>;
  onBack: () => void;
}

/** Second Owner sign-in step: the 6-digit code emailed after the password. */
export const EmailCodeForm: React.FC<EmailCodeFormProps> = ({ onVerify, onResend, onBack }) => {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const ref = useAutoFocus<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setNotice("");
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your email.");
    setLoading(true);
    const err = await run(() => onVerify(code));
    setLoading(false);
    setError(err ?? "");
  };

  const resend = async () => {
    if (loading) return;
    setLoading(true);
    const err = await run(onResend);
    setLoading(false);
    setError(err ?? "");
    setNotice(err ? "" : "A new code has been sent.");
  };

  return (
    <div className="login-wrap">
      <form className="login-card card" onSubmit={submit} noValidate>
        <Brand sub="Check your email" />
        <p className="login-help">
          We sent a 6-digit sign-in code to the Owner email address. It expires in 5 minutes.
        </p>
        {notice ? (
          <div className="login-notice" role="status">
            {notice}
          </div>
        ) : null}
        <label className="field">
          Sign-in code
          <input
            ref={ref}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        <div className="field-err" role="alert">
          {error}
        </div>
        <Button type="submit" variant="primary" block disabled={loading}>
          {loading ? "Please wait…" : "Verify"}
        </Button>
        <div className="login-links">
          <button type="button" className="login-link" onClick={() => void resend()}>
            Send a new code
          </button>
        </div>
        <BackLink onBack={onBack} />
      </form>
    </div>
  );
};
