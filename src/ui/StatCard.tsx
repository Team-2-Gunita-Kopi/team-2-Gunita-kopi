import React from "react";

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badge?: React.ReactNode;
  trend?: { value: string; isPositive?: boolean };
}

export function StatCard({ title, value, subtitle, badge, trend }: StatCardProps) {
  return (
    <div className="kpi">
      <div className="lbl">
        {title} {badge}
      </div>
      <div className="val num">{value}</div>
      {(subtitle || trend) && (
        <div className="muted" style={{ fontSize: ".8rem" }}>
          {trend ? <span>{trend.value} </span> : null}
          {subtitle}
        </div>
      )}
    </div>
  );
}
