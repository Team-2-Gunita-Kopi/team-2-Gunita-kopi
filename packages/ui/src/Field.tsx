import React from "react";

export interface FieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}

export function Field({ label, error, children }: FieldProps) {
  return (
    <label className="field">
      {label}
      {children}
      <span className="field-err" role={error ? "alert" : undefined}>
        {error}
      </span>
    </label>
  );
}
