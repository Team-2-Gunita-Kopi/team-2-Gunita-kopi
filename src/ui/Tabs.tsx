import React from "react";

export interface TabItem {
  id: string;
  label: string;
  href?: string;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange?: (tabId: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div className={["subtabs", className ?? ""].filter(Boolean).join(" ")} role="tablist">
      {tabs.map((t) => {
        const on = t.id === activeTab;
        return (
          <a
            key={t.id}
            className={on ? "subtab-link on" : "subtab-link"}
            href={t.href ?? `#${t.id}`}
            role="tab"
            aria-selected={on}
            onClick={
              onChange
                ? (e) => {
                    if (!t.href) e.preventDefault();
                    onChange(t.id);
                  }
                : undefined
            }
          >
            {t.label}
          </a>
        );
      })}
    </div>
  );
}
