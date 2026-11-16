"use client";

import React from "react";
import { Icon } from "./Icon";

export interface TopBarProps {
  title: string;
  userName: string;
  roleLabel: string;
  onLogout: () => void;
  /** Rendered between the title and the user chip (e.g. online/sync badges). */
  statusSlot?: React.ReactNode;
  /** Extra actions listed in the mobile "More" sheet. */
  menuItems?: { label: string; onSelect: () => void }[];
}

export const TopBar: React.FC<TopBarProps> = ({ title, userName, roleLabel, onLogout, statusSlot }) => (
  <header className="topbar">
    <span className="tb-title">{title}</span>
    {statusSlot}
    <span className="tb-user">
      <Icon name="user" />
      <span>
        <strong>{userName}</strong> <span className="muted">{roleLabel}</span>
      </span>
    </span>
    <button type="button" className="btn btn-sm" id="tb-logout" aria-label="Log out" onClick={onLogout}>
      <Icon name="logout" />
      <span className="tb-logout-lbl">Log out</span>
    </button>
  </header>
);
