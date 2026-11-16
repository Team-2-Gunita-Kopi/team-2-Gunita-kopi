import React from "react";
import { SidebarNav, NavItem } from "./SidebarNav";
import { TopBar, TopBarProps } from "./TopBar";

export interface AppShellProps {
  navItems: NavItem[];
  currentPath?: string;
  onNavigate?: (href: string) => void;
  topBarProps: TopBarProps;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  navItems,
  currentPath,
  onNavigate,
  topBarProps,
  children,
}) => {
  return (
    <div className="min-h-screen flex bg-gray-50">
      <SidebarNav
        items={navItems}
        currentPath={currentPath}
        onNavigate={onNavigate}
        brandSubtitle={topBarProps.appName}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar {...topBarProps} />
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
};
