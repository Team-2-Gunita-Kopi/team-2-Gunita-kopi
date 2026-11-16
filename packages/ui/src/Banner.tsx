import React from "react";
import { Icon } from "./Icon";

export interface BannerProps {
  tone: "warn" | "danger";
  children: React.ReactNode;
}

export function Banner({ tone, children }: BannerProps) {
  const danger = tone === "danger";
  return (
    <div className={danger ? "lowstock-banner banner-danger" : "lowstock-banner"} role={danger ? "alert" : "status"}>
      <Icon name="alert" />
      <div>{children}</div>
    </div>
  );
}
