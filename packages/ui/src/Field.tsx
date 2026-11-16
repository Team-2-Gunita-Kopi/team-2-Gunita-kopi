import React from "react";

export interface FieldProps {
  label: string;
  error?: string;
  /** id for the error text so the control can reference it via aria-describedby. */
  errorId?: string;
  children: React.ReactNode;
}

export function Field({ label, error, errorId, children }: FieldProps) {
  return (
    <label className="field">
      {label}
      {children}
      <span id={errorId} className="field-err" role={error ? "alert" : undefined}>
        {error}
      </span>
    </label>
  );
}
