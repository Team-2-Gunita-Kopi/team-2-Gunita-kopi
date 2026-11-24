"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  IdleLogout,
  NavItem,
  OverlayProvider,
  useConfirm,
  useToast,
} from "@/ui";
import { getSession, signOut } from "@/staff/features/auth";
import { OfflineBanner } from "@/staff/components/OfflineBanner";
import { SyncIndicator } from "@/staff/components/SyncIndicator";
import { useConnectivity } from "@/staff/lib/connectivity";
import { mockRpc } from "@/staff/lib/mock-db";
import { QueryProvider } from "@/staff/lib/query";
import { USE_MOCKS } from "@/staff/lib/use-mocks";
import { useSync } from "@/staff/features/pos/hooks/use-sync";
import { withBasePath } from "@/staff/lib/base-path";

const POS_NAV_ITEMS: NavItem[] = [
  { label: "POS", short: "POS", href: "/staff/pos", icon: "cart" },
  { label: "Orders", short: "Orders", href: "/staff/orders", icon: "receipt" },
  { label: "Inventory", short: "Stock", href: "/staff/inventory", icon: "box" },
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
  const { pendingCount, failedCount, syncNow, isSyncing } = useSync();

  useEffect(() => {
    const session = getSession();
    if (session?.fullName) setUserName(session.fullName);
  }, []);

  const handleLogout = async () => {
    await signOut();
    router.push("/staff/login");
  };

  const handleSyncNow = async () => {
    try {
      await syncNow();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Sync failed.", true);
    }
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

  // Log out has its own button; the menu only holds demo tools, so real mode shows no menu.
  const menuItems = USE_MOCKS
    ? [
        {
          label: "Simulate offline",
          onSelect: () => setSimulatedOffline(!simulatedOffline),
        },
        { label: "Reset demo data", onSelect: resetDemo },
      ]
    : [];

  const unsynced = pendingCount + failedCount;
  const warning =
    unsynced > 0
      ? `You have ${unsynced} unsynced order${unsynced === 1 ? "" : "s"}. They stay on this device and will sync after you sign in again.`
      : undefined;

  return (
    <>
      <OfflineBanner online={online} />
      <AppShell
        hrefFor={withBasePath}
        sidebarStorageKey="gk-pos-sidebar-collapsed"
        navItems={POS_NAV_ITEMS}
        currentPath={pathname}
        onNavigate={(href) => router.push(href)}
        topBarProps={{
          title:
            pathname === "/staff/orders" || pathname.startsWith("/staff/orders/")
              ? "Orders"
              : pathname.startsWith("/staff/inventory")
                ? "Inventory"
                : "POS — Menu & Cart",
          userName,
          roleLabel: "Barista",
          onLogout: handleLogout,
          statusSlot: (
            <SyncIndicator
              pending={pendingCount}
              failed={failedCount}
              syncing={isSyncing}
              onSync={handleSyncNow}
            />
          ),
          menuItems,
        }}
      >
        {children}
      </AppShell>
      <IdleLogout
        timeoutMs={IDLE_MS}
        onLogout={handleLogout}
        warning={warning}
      />
    </>
  );
}

export default function PosAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryProvider>
      <OverlayProvider>
        <PosShell>{children}</PosShell>
      </OverlayProvider>
    </QueryProvider>
  );
}
