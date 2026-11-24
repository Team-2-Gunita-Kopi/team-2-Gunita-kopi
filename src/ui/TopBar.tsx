"use client";

import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface TopBarProps {
  title: string;
  userName: string;
  roleLabel: string;
  onLogout: () => void;
  /** Rendered between the title and the user chip (e.g. online/sync badges). */
  statusSlot?: React.ReactNode;
  /** Extra actions: a dropdown in the top bar on desktop, listed in the More sheet on mobile. */
  menuItems?: { label: string; onSelect: () => void }[];
}

export const TopBar: React.FC<TopBarProps> = ({ title, userName, roleLabel, onLogout, statusSlot, menuItems }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const items = menuItems ?? [];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="topbar">
      <span className="tb-title">{title}</span>
      {statusSlot}
      <span className="tb-user">
        <Icon name="user" />
        <span>
          <strong>{userName}</strong> <span className="muted">{roleLabel}</span>
        </span>
      </span>
      {items.length > 0 && (
        <span className="tb-menu-wrap" ref={wrapRef}>
          <button
            type="button"
            className="tb-menu-btn"
            aria-label="User menu"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
          {open && (
            <div className="tb-menu" role="menu">
              {items.map((m) => (
                <button
                  key={m.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    m.onSelect();
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </span>
      )}
      <button type="button" className="btn btn-sm" id="tb-logout" aria-label="Log out" onClick={onLogout}>
        <Icon name="logout" />
        <span className="tb-logout-lbl">Log out</span>
      </button>
    </header>
  );
};
