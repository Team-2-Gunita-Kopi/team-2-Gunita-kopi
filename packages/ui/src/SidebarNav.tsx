import React from "react";

export interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export interface SidebarNavProps {
  items: NavItem[];
  currentPath?: string;
  onNavigate?: (href: string) => void;
  brandTitle?: string;
  brandSubtitle?: string;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  items,
  currentPath = "",
  onNavigate,
  brandTitle = "Gunita Kopi",
  brandSubtitle = "Coffee & POS",
}) => {
  return (
    <aside className="w-64 bg-[#0F2F24] text-white flex flex-col min-h-screen">
      <div className="p-6 border-b border-[#1C4B3B]">
        <h1 className="text-lg font-bold tracking-tight text-white">
          {brandTitle}
        </h1>
        <p className="text-xs text-emerald-300/80">{brandSubtitle}</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Sidebar">
        {items.map((item) => {
          const isActive =
            currentPath === item.href ||
            (item.href !== "/" && currentPath.startsWith(item.href));

          return (
            <a
              key={item.href}
              href={item.href}
              onClick={(e) => {
                if (onNavigate) {
                  e.preventDefault();
                  onNavigate(item.href);
                }
              }}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "text-gray-300 hover:bg-[#1C4B3B] hover:text-white"
              }`}
            >
              <div className="flex items-center space-x-3">
                {item.icon && (
                  <span className="text-emerald-300">{item.icon}</span>
                )}
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className="text-xs bg-[#1C4B3B] text-emerald-200 px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </a>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#1C4B3B] text-xs text-emerald-300/60">
        Gunita Kopi v0.1.0
      </div>
    </aside>
  );
};
