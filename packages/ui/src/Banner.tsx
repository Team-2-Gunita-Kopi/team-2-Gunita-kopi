import React from "react";
import { Icon } from "./Icon";

export interface BannerProps {
  tone: "warn" | "danger";
  children: React.ReactNode;
}

export function Banner({ tone, children }: BannerProps) {
  const danger = tone === "danger";
  return (
    <div
      className="lowstock-banner"
      role={danger ? "alert" : "status"}
      style={danger ? { borderColor: "var(--danger)" } : undefined}
    >
      <Icon name="alert" style={danger ? { color: "var(--danger)" } : undefined} />
      <div>{children}</div>
    </div>
  );
}
