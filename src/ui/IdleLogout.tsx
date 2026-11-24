"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export interface IdleLogoutProps {
  timeoutMs: number;
  warnSeconds?: number;
  onLogout: (reason: "idle" | "manual") => void;
  /** Extra content above the buttons (e.g. a pending-orders note). */
  warning?: React.ReactNode;
}

const EVENTS = ["mousemove", "keydown", "click", "touchstart", "scroll"] as const;

export const IdleLogout: React.FC<IdleLogoutProps> = ({ timeoutMs, warnSeconds = 30, onLogout, warning }) => {
  const [left, setLeft] = useState<number | null>(null); // null = warning hidden
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;
  const warningShown = left !== null;
  const deadline = useRef(0);

  // Idle timer: armed only while the warning is hidden; activity restarts it.
  useEffect(() => {
    if (warningShown) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        deadline.current = Date.now() + warnSeconds * 1000;
        setLeft(warnSeconds);
      }, timeoutMs);
    };
    arm();
    EVENTS.forEach((ev) => document.addEventListener(ev, arm, { passive: true }));
    return () => {
      EVENTS.forEach((ev) => document.removeEventListener(ev, arm));
      clearTimeout(timer);
    };
  }, [warningShown, timeoutMs, warnSeconds]);

  // Countdown while the warning is showing.
  useEffect(() => {
    if (!warningShown) return;
    // Derive seconds left from a wall-clock deadline so a throttled tab still signs out on time.
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)));
    const id = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [warningShown]);

  useEffect(() => {
    if (left !== null && left <= 0) {
      setLeft(null);
      onLogoutRef.current("idle");
    }
  }, [left]);

  if (left === null) return null;

  return (
    <Dialog isOpen sticky title="Still there?" onClose={() => setLeft(null)}>
      <p>
        You&apos;ll be signed out in <strong className="num">{left}</strong> s.
      </p>
      {warning}
      <div className="modal-actions">
        <Button
          onClick={() => {
            setLeft(null);
            onLogoutRef.current("manual");
          }}
        >
          Sign out now
        </Button>
        <Button variant="primary" onClick={() => setLeft(null)}>
          Stay signed in
        </Button>
      </div>
    </Dialog>
  );
};
