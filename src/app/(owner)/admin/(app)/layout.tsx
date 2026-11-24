"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell, IdleLogout, NavItem, OverlayProvider, useConfirm, useToast } from "@/ui";
import { getSession, signOut } from "@/owner/features/auth";
import { mockRpc } from "@/owner/lib/mock-db";
import { QueryProvider } from "@/owner/lib/query";
import { USE_MOCKS } from "@/owner/lib/use-mocks";
import { withBasePath } from "@/owner/lib/base-path";

const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", short: "Home", href: "/admin/dashboard", icon: "home" },
  { label: "Orders", short: "Orders", href: "/admin/orders", icon: "receipt" },
  { label: "Products", short: "Menu", href: "/admin/products", icon: "cup" },
  { label: "Inventory", short: "Stock", href: "/admin/inventory", icon: "box" },
  { label: "Suppliers", short: "Suppliers", href: "/admin/suppliers", icon: "truck" },
  { label: "Reports", short: "Reports", href: "/admin/reports", icon: "chart" },
  { label: "Users", short: "Users", href: "/admin/users", icon: "users" },
];

// Idle sign-out (decided 2026-11-24): the common 30-minute standard for an admin portal.
const IDLE_MS = 30 * 60 * 1000;

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
    router.push("/admin/login");
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
        hrefFor={withBasePath}
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
