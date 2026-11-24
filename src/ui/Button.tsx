import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** "secondary" | "outline" are legacy aliases of "default". */
  variant?: "default" | "primary" | "coffee" | "danger" | "ghost" | "secondary" | "outline";
  /** Only "sm" has a class; "md" | "lg" are accepted for legacy callers. */
  size?: "sm" | "md" | "lg";
  block?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size, block, className, type = "button", ...props },
  ref,
) {
  const cls = [
    "btn",
    variant !== "default" && variant !== "secondary" && variant !== "outline" ? `btn-${variant}` : "",
    size === "sm" ? "btn-sm" : "",
    block ? "btn-block" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return <button ref={ref} type={type} className={cls} {...props} />;
});
