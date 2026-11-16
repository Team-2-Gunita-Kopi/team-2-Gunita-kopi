import React from "react";

export interface TopBarProps {
  appName: string;
  userName?: string;
  role?: string;
  onLogout?: () => void;
  statusBadge?: React.ReactNode;
  syncIndicator?: React.ReactNode;
}

export const TopBar: React.FC<TopBarProps> = ({
  appName,
  userName = "User",
  role,
  onLogout,
  statusBadge,
  syncIndicator,
}) => {
  return (
    <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <span className="text-base font-semibold text-[#0F2F24] tracking-tight">
          Gunita Kopi{" "}
          <span className="text-xs font-normal text-gray-500">| {appName}</span>
        </span>
        {statusBadge}
        {syncIndicator}
      </div>

      <div className="flex items-center space-x-4">
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900 leading-none">
            {userName}
          </p>
          {role && (
            <p className="text-xs text-gray-500 font-mono mt-0.5 capitalize">
              {role.replace("_", " ")}
            </p>
          )}
        </div>
        {onLogout && (
          <button
            onClick={onLogout}
            type="button"
            className="text-xs font-medium text-gray-600 hover:text-red-700 hover:bg-red-50 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            Log out
          </button>
        )}
      </div>
    </header>
  );
};
