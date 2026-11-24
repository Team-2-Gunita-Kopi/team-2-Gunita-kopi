"use client";

import { useEffect } from "react";

/** Registers the POS service worker for /staff only, so it never controls or caches Owner pages. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/staff/sw.js", { scope: "/staff/" }).catch(() => undefined);
  }, []);
  return null;
}
