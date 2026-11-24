"use client";

import React from "react";
import { Icon } from "./Icon";

export interface ToastItem {
  id: number;
  message: string;
  isError: boolean;
}

export function ToastRegion({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="toast-region" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={t.isError ? "toast err" : "toast"}>
          <Icon name={t.isError ? "alert" : "check"} />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
