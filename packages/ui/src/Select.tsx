import React from "react";
import { Field } from "./Field";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, options, ...props },
  ref,
) {
  const uid = React.useId();
  const errorId = error ? `${uid}-err` : undefined;
  const select = (
    <select ref={ref} aria-invalid={error ? true : undefined} aria-describedby={errorId} {...props}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  if (!label) return select;
  return (
    <Field label={label} error={error} errorId={errorId}>
      {select}
    </Field>
  );
});
