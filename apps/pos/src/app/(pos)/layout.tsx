"use client";

import React, { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell, IdleLogout, NavItem, OverlayProvider, useConfirm, useToast } from "@gunita/ui";
import { getSession, signOut } from "@/features/auth";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SyncIndicator } from "@/components/SyncIndicator";
import { useConnectivity } from "@/lib/connectivity";
import { mockRpc } from "@/lib/mock-db";
import { QueryProvider } from "@/lib/query";
import { USE_MOCKS } from "@/lib/use-mocks";
import { getPendingSyncCount } from "@/offline/outbox";
import { syncOutboxOrders } from "@/offline/sync";
import { initSyncTriggers } from "@/offline/triggers";

const POS_NAV_ITEMS: NavItem[] = [
  { label: "POS", short: "POS", href: "/pos", icon: "cart" },
  { label: "Orders", short: "Orders", href: "/orders", icon: "receipt" },
  { label: "Inventory", short: "Stock", href: "/inventory", icon: "box" },
];

const IDLE_MS = 5 * 60 * 1000;

function PosShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const { online, simulatedOffline, setSimulatedOffline } = useConnectivity();
  const [userName, setUserName] = useState("Barista");
  const [pending, setPending] = useState(0);

  const refreshPending = useCallback(async () => setPending(await getPendingSyncCount()), []);

  useEffect(() => {
    const session = getSession();
    if (session?.fullName) setUserName(session.fullName);
  }, []);

  useEffect(() => {
    void refreshPending();
    return initSyncTriggers(() => void refreshPending());
  }, [refreshPending]);

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  // Full outbox sync wiring (progress, errors, retry) lands in Task 20; this runs the existing sync once.
  const syncNow = async () => {
    try {
      await syncOutboxOrders();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Sync failed.", true);
    }
    await refreshPending();
  };

  const resetDemo = async () => {
    const ok = await confirm({
      title: "Reset demo data",
      message: "Reset all demo data for both Owner and Barista?",
      confirmLabel: "Reset",
      danger: true,
    });
    if (!ok) return;
    try {
      await mockRpc("reset");
      await queryClient.invalidateQueries();
      toast("Demo data reset.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Reset failed.", true);
    }
  };

  const menuItems = [
    ...(USE_MOCKS
      ? [
          { label: "Simulate offline", onSelect: () => setSimulatedOffline(!simulatedOffline) },
          { label: "Reset demo data", onSelect: resetDemo },
        ]
      : []),
    { label: "Sign out", onSelect: handleLogout },
  ];

  const warning =
    pending > 0
      ? `You have ${pending} unsynced order${pending === 1 ? "" : "s"}. They stay on this device and will sync after you sign in again.`
      : undefined;

  return (
    <>
      <OfflineBanner online={online} />
      <AppShell
        navItems={POS_NAV_ITEMS}
        currentPath={pathname}
        onNavigate={(href) => router.push(href)}
        topBarProps={{
          title: "Barista POS",
          userName,
          roleLabel: "Barista",
          onLogout: handleLogout,
          statusSlot: <SyncIndicator pending={pending} onSync={syncNow} />,
          menuItems,
        }}
      >
        {children}
      </AppShell>
      <IdleLogout timeoutMs={IDLE_MS} onLogout={handleLogout} warning={warning} />
    </>
  );
}

export default function PosAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <OverlayProvider>
        <PosShell>{children}</PosShell>
      </OverlayProvider>
    </QueryProvider>
  );
}
