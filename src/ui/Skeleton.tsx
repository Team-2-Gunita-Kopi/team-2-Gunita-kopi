import React from "react";

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  );
}
