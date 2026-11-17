"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, NavItem } from "@gunita/ui";

const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Orders", href: "/orders" },
  { label: "Products", href: "/products" },
  { label: "Inventory", href: "/inventory" },
  { label: "Suppliers", href: "/suppliers" },
  { label: "Reports", href: "/reports" },
  { label: "Users", href: "/users" },
];

export default function AdminAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    // The server revokes the session and clears the HttpOnly cookie.
    await fetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  };

  return (
    <AppShell
      navItems={ADMIN_NAV_ITEMS}
      currentPath={pathname}
      onNavigate={(href) => router.push(href)}
      topBarProps={{
        appName: "Admin Portal",
        userName: "Store Owner",
        role: "owner_admin",
        onLogout: handleLogout,
      }}
    >
      {children}
    </AppShell>
  );
}
