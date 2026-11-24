import React from "react";

export interface HBarChartProps {
  rows: { label: string; value: number }[];
  format?: (n: number) => string;
}

/** Port of hbarChart() in apps/admin/app.js. */
export function HBarChart({ rows, format }: HBarChartProps) {
  const w = 440,
    rh = 34;
  const h = rows.length * rh + 10 || 40;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Best selling products">
        <title>Best sellers</title>
        {rows.map((r, i) => {
          const bw = Math.max(4, (r.value / max) * (w - 190));
          const y = i * rh + 6;
          return (
            <g key={i}>
              <text x={0} y={y + 15} fill="var(--fg)" fontSize={11}>
                {r.label.length > 20 ? r.label.slice(0, 19) + "…" : r.label}
              </text>
              <rect x={155} y={y} width={bw.toFixed(1)} height={20} rx={6} fill="var(--coffee)" />
              <text x={(161 + bw).toFixed(1)} y={y + 15} fill="var(--fg-muted)" fontSize={10} fontFamily="var(--font-num)">
                {format ? format(r.value) : r.value}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span>
          <i className="sw" style={{ background: "var(--coffee)" }} />
          Units sold
        </span>
      </div>
    </>
  );
}
