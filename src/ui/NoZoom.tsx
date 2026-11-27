"use client";

import { useEffect } from "react";

const ZOOM_KEYS = ["+", "=", "-", "_", "0"];

/**
 * Blocks page zoom the viewport meta tag cannot: Ctrl/Cmd + wheel (also trackpad pinch on desktop),
 * Ctrl/Cmd + plus/minus/0, and Safari pinch (iOS ignores user-scalable=no). Text copy is blocked in globals.css.
 */
export function NoZoom() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ZOOM_KEYS.includes(e.key)) e.preventDefault();
    };
    const onGesture = (e: Event) => e.preventDefault();
    // passive: false, or the browser ignores preventDefault on wheel.
    const opts = { passive: false };
    window.addEventListener("wheel", onWheel, opts);
    window.addEventListener("keydown", onKey);
    document.addEventListener("gesturestart", onGesture, opts);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("gesturestart", onGesture);
    };
  }, []);
  return null;
}
