"use client";

import React, { useEffect, useState } from "react";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import { SidebarNav, isActivePath, type NavItem } from "./SidebarNav";
import { TopBar, type TopBarProps } from "./TopBar";

export const SIDEBAR_LS_KEY = "gk-sidebar-collapsed";

export interface AppShellProps {
  navItems: NavItem[];
  currentPath?: string;
  onNavigate?: (href: string) => void;
  /** Builds only the link's href (POS adds its /staff basePath); routing and active state use the plain path. */
  hrefFor?: (href: string) => string;
  /** localStorage key for the collapsed sidebar; each site on a shared origin needs its own. */
  sidebarStorageKey?: string;
  topBarProps: TopBarProps;
  /** Bottom-nav items shown before the "More" sheet (default 4). */
  mobileNavCount?: number;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  hrefFor,
  sidebarStorageKey = SIDEBAR_LS_KEY,
  navItems,
  currentPath = "",
  onNavigate,
  topBarProps,
  mobileNavCount = 4,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(sidebarStorageKey) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    return () => document.body.classList.remove("sidebar-collapsed");
  }, [collapsed]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(sidebarStorageKey, next ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  };

  const go = (e: React.MouseEvent, href: string) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(href);
    }
  };

  const first = navItems.slice(0, mobileNavCount);
  const rest = navItems.slice(mobileNavCount);
  const menuItems = topBarProps.menuItems ?? [];

  return (
    <div className="app">
      <SidebarNav items={navItems} currentPath={currentPath} onNavigate={onNavigate} hrefFor={hrefFor} collapsed={collapsed} onToggle={toggle} />
      <main className="main" id="main" tabIndex={-1}>
        <TopBar {...topBarProps} />
        <div id="screen">{children}</div>
      </main>
      <nav className="bottomnav" aria-label="Mobile navigation">
        {first.map((n) => {
          const active = isActivePath(currentPath, n.href);
          return (
            <a
              key={n.href}
              href={hrefFor ? hrefFor(n.href) : n.href}
              className={"role-link" + (active ? " active" : "")}
              aria-current={active ? "page" : undefined}
              onClick={(e) => go(e, n.href)}
            >
              <Icon name={n.icon} />
              <span>{n.short}</span>
            </a>
          );
        })}
        {(rest.length > 0 || menuItems.length > 0) && (
          <button type="button" className="role-link" onClick={() => setMoreOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
            <span>More</span>
          </button>
        )}
      </nav>
      <Dialog isOpen={moreOpen} onClose={() => setMoreOpen(false)} title="Menu">
        <div className="more-sheet">
          {rest.map((n) => (
            <a
              key={n.href}
              href={hrefFor ? hrefFor(n.href) : n.href}
              className={"role-link" + (isActivePath(currentPath, n.href) ? " active" : "")}
              aria-current={isActivePath(currentPath, n.href) ? "page" : undefined}
              onClick={(e) => {
                setMoreOpen(false);
                go(e, n.href);
              }}
            >
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </a>
          ))}
          {menuItems.map((m) => (
            <button
              key={m.label}
              type="button"
              className="role-link"
              onClick={() => {
                setMoreOpen(false);
                m.onSelect();
              }}
            >
              <span>{m.label}</span>
            </button>
          ))}
          <button
            type="button"
            className="role-link"
            onClick={() => {
              setMoreOpen(false);
              topBarProps.onLogout();
            }}
          >
            <Icon name="logout" />
            <span>Log out</span>
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => setMoreOpen(false)}>
            Close
          </button>
        </div>
      </Dialog>
    </div>
  );
};
