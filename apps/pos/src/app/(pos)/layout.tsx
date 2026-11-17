"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, NavItem, StatusBadge } from "@gunita/ui";
import { initSyncTriggers } from "@/offline/triggers";
import { getPendingSyncCount } from "@/offline/outbox";

const POS_NAV_ITEMS: NavItem[] = [
  { label: "POS Terminal", href: "/pos" },
  { label: "Orders", href: "/orders" },
  { label: "Inventory", href: "/inventory" },
];

export default function PosAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const refreshPendingCount = async () => {
    const count = await getPendingSyncCount();
    setPendingSyncCount(count);
  };

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    refreshPendingCount();
    const cleanup = initSyncTriggers(() => {
      refreshPendingCount();
    });

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      cleanup();
    };
  }, []);

  const handleLogout = async () => {
    // The server revokes the session and clears the HttpOnly cookie.
    await fetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  };

  const connectionBadge = isOnline ? (
    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
      <span>Online</span>
    </span>
  ) : (
    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-300">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
      <span>Offline Mode</span>
    </span>
  );

  const syncIndicator = (
    <div className="flex items-center space-x-2">
      <span className="text-xs text-gray-500">Outbox:</span>
      <StatusBadge
        status={pendingSyncCount > 0 ? "preparing" : "synced"}
        label={
          pendingSyncCount > 0 ? `${pendingSyncCount} Pending` : "All Synced"
        }
      />
    </div>
  );

  return (
    <AppShell
      navItems={POS_NAV_ITEMS}
      currentPath={pathname}
      onNavigate={(href) => router.push(href)}
      topBarProps={{
        appName: "Barista POS",
        userName: "Barista Station 1",
        role: "barista",
        onLogout: handleLogout,
        statusBadge: connectionBadge,
        syncIndicator: syncIndicator,
      }}
    >
      {children}
    </AppShell>
  );
}
