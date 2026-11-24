"use client";

import React from "react";
import { Icon } from "@/ui";

export function OfflineBanner({ online }: { online: boolean }) {
  if (online) return null;
  return (
    <div className="offline-banner show" role="status">
      <Icon name="alert" />
      <span>Offline — orders are saved on this device</span>
    </div>
  );
}
