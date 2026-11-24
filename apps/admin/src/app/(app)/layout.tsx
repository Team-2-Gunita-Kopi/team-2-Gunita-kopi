"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell, IdleLogout, NavItem, OverlayProvider, useConfirm, useToast } from "@gunita/ui";
import { getSession, signOut } from "@/features/auth";
import { mockRpc } from "@/lib/mock-db";
import { QueryProvider } from "@/lib/query";
import { USE_MOCKS } from "@/lib/use-mocks";

const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", short: "Home", href: "/dashboard", icon: "home" },
  { label: "Orders", short: "Orders", href: "/orders", icon: "receipt" },
  { label: "Products", short: "Menu", href: "/products", icon: "cup" },
  { label: "Inventory", short: "Stock", href: "/inventory", icon: "box" },
  { label: "Suppliers", short: "Suppliers", href: "/suppliers", icon: "truck" },
  { label: "Reports", short: "Reports", href: "/reports", icon: "chart" },
  { label: "Users", short: "Users", href: "/users", icon: "users" },
];

const IDLE_MS = 5 * 60 * 1000;

function OwnerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [userName, setUserName] = useState("Owner");

  useEffect(() => {
    const session = getSession();
    if (session?.fullName) setUserName(session.fullName);
  }, []);

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
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

  // Log out has its own button; the menu only holds the demo reset, so real mode shows no menu.
  const menuItems = USE_MOCKS ? [{ label: "Reset demo data", onSelect: resetDemo }] : [];
  const pageTitle =
    ADMIN_NAV_ITEMS.find(
      (item) =>
        pathname === item.href || pathname.startsWith(`${item.href}/`),
    )?.label ?? "Admin Portal";

  return (
    <>
      <AppShell
        navItems={ADMIN_NAV_ITEMS}
        currentPath={pathname}
        onNavigate={(href) => router.push(href)}
        topBarProps={{ title: pageTitle, userName, roleLabel: "Owner", onLogout: handleLogout, menuItems }}
      >
        {children}
      </AppShell>
      <IdleLogout timeoutMs={IDLE_MS} onLogout={handleLogout} />
    </>
  );
}

export default function AdminAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <OverlayProvider>
        <OwnerShell>{children}</OwnerShell>
      </OverlayProvider>
    </QueryProvider>
  );
}
