import React from "react";

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ height: "1rem", margin: ".6rem 0", borderRadius: 6, background: "var(--muted)", opacity: 0.5 }} />
      ))}
    </div>
  );
}
