"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, NavItem } from "@gunita/ui";
import { supabaseBrowser } from "@/lib/supabase-browser";

const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", short: "Home", href: "/dashboard", icon: "home" },
  { label: "Orders", short: "Orders", href: "/orders", icon: "receipt" },
  { label: "Products", short: "Menu", href: "/products", icon: "cup" },
  { label: "Inventory", short: "Stock", href: "/inventory", icon: "box" },
  { label: "Suppliers", short: "Suppliers", href: "/suppliers", icon: "truck" },
  { label: "Reports", short: "Reports", href: "/reports", icon: "chart" },
  { label: "Users", short: "Users", href: "/users", icon: "users" },
];

export default function AdminAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await supabaseBrowser.auth.signOut();
    router.push("/login");
  };

  return (
    <AppShell
      navItems={ADMIN_NAV_ITEMS}
      currentPath={pathname}
      onNavigate={(href) => router.push(href)}
      topBarProps={{
        title: "Admin Portal",
        userName: "Store Owner",
        roleLabel: "Owner",
        onLogout: handleLogout,
      }}
    >
      {children}
    </AppShell>
  );
}
