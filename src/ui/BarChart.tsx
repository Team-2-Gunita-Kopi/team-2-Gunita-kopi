import React from "react";
import { formatPeso } from "./format";

export interface BarChartProps {
  values: number[];
  labels: string[];
}

/** Port of barChart() in apps/admin/app.js. */
export function BarChart({ values, labels }: BarChartProps) {
  const w = 900,
    h = 220,
    pad = 56;
  const n = values.length;
  const max = Math.max(...values, 1) * 1.15;
  const slot = (w - pad - 8) / (n || 1);
  const bw = Math.min(34, slot * 0.6);
  const labelEvery = n > 10 ? Math.ceil(n / 10) : 1;
  const showVals = n <= 10;
  return (
    <>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Sales chart">
        <title>Sales chart</title>
        {[0.33, 0.66, 1].map((f) => {
          const y = h - 30 - f * (h - pad - 30);
          return (
            <g key={f}>
              <line x1={pad} y1={y.toFixed(1)} x2={w - 8} y2={y.toFixed(1)} stroke="var(--muted)" strokeDasharray="3 5" />
              <text x={pad - 6} y={(y + 4).toFixed(1)} textAnchor="end" fill="var(--fg-muted)" fontSize={10} fontFamily="var(--font-num)">
                {`₱${((max * f) / 1000).toFixed(1)}k`}
              </text>
            </g>
          );
        })}
        {values.map((v, i) => {
          const bh = Math.max(2, (v / max) * (h - pad - 30));
          const x = pad + i * slot + (slot - bw) / 2;
          const y = h - 30 - bh;
          return (
            <g key={i}>
              <rect
                x={x.toFixed(1)}
                y={y.toFixed(1)}
                width={bw.toFixed(1)}
                height={bh.toFixed(1)}
                rx={Math.min(6, bw / 3)}
                fill="var(--moss)"
                opacity={(0.55 + (0.45 * v) / max).toFixed(2)}
              >
                <title>{`${labels[i]} — ${formatPeso(v)}`}</title>
              </rect>
              {i % labelEvery === 0 && (
                <text x={(x + bw / 2).toFixed(1)} y={h - 12} textAnchor="middle" fill="var(--fg-muted)" fontSize={11}>
                  {labels[i]}
                </text>
              )}
              {showVals && (
                <text x={(x + bw / 2).toFixed(1)} y={(y - 6).toFixed(1)} textAnchor="middle" fill="var(--leaf)" fontSize={10} fontFamily="var(--font-num)">
                  {`${(v / 1000).toFixed(1)}k`}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span>
          <i className="sw" style={{ background: "var(--moss)" }} />
          Gross sales (₱)
        </span>
      </div>
    </>
  );
}
