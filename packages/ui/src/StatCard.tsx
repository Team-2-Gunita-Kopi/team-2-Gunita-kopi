import React from "react";

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badge?: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  badge,
  trend,
}) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
          {title}
        </p>
        {badge}
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {(subtitle || trend) && (
        <div className="mt-2 flex items-center text-xs text-gray-500 space-x-2">
          {trend && (
            <span
              className={`font-semibold ${
                trend.isPositive ? "text-emerald-700" : "text-red-600"
              }`}
            >
              {trend.value}
            </span>
          )}
          {subtitle && <span>{subtitle}</span>}
        </div>
      )}
    </div>
  );
};
