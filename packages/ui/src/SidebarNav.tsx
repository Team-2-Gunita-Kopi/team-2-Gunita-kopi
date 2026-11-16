"use client";

import React from "react";
import { Icon, type IconName } from "./Icon";

export interface NavItem {
  label: string;
  short: string;
  href: string;
  icon: IconName;
}

export interface SidebarNavProps {
  items: NavItem[];
  currentPath?: string;
  onNavigate?: (href: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export function isActivePath(currentPath: string, href: string): boolean {
  return currentPath === href || (href !== "/" && currentPath.startsWith(href + "/"));
}

const PanelClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
    <path d="m16 15-3-3 3-3" />
  </svg>
);
const Hamburger = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true">
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="18" x2="20" y2="18" />
  </svg>
);

export const SidebarNav: React.FC<SidebarNavProps> = ({ items, currentPath = "", onNavigate, collapsed, onToggle }) => (
  <aside className="sidebar" id="sidebar">
    <button
      className="sb-toggle"
      type="button"
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-expanded={!collapsed}
      aria-controls="sidebar"
      onClick={onToggle}
    >
      {collapsed ? <Hamburger /> : <PanelClose />}
    </button>
    <div className="brand">
      <span className="brand-baybayin" lang="tl-Tglg" aria-hidden="true">
        ᜄᜓᜈᜒᜆ ᜃᜓᜉᜒ
      </span>
      <span className="brand-word">Gunita Kopi</span>
      <span className="brand-sub">POS System</span>
    </div>
    <nav className="role-nav" aria-label="Main navigation">
      {items.map((n) => {
        const active = isActivePath(currentPath, n.href);
        return (
          <a
            key={n.href}
            href={n.href}
            className={"role-link" + (active ? " active" : "")}
            title={n.label}
            aria-current={active ? "page" : undefined}
            onClick={(e) => {
              if (onNavigate) {
                e.preventDefault();
                onNavigate(n.href);
              }
            }}
          >
            <Icon name={n.icon} />
            <span className="lbl-l">{n.label}</span>
            <span className="lbl-s">{n.short}</span>
          </a>
        );
      })}
    </nav>
  </aside>
);
