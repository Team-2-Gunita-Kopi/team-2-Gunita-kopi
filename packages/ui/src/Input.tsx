import React from "react";
import { Field } from "./Field";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Legacy; rendered as muted text under the input. */
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helperText, ...props },
  ref,
) {
  const input = <input ref={ref} aria-invalid={error ? true : undefined} {...props} />;
  if (!label) return input;
  return (
    <Field label={label} error={error}>
      {input}
      {helperText && !error ? <span className="muted">{helperText}</span> : null}
    </Field>
  );
});
