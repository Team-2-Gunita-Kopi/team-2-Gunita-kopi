"use client";

import React from "react";

export function SyncIndicator({
  pending,
  failed = 0,
  syncing = false,
  onSync,
}: {
  pending: number;
  failed?: number;
  syncing?: boolean;
  onSync: () => void;
}) {
  return (
    <span className="sync-indicator">
      <span className="muted" aria-live="polite">
        {syncing ? "Syncing…" : `${pending} to sync`}
        {failed > 0 ? ` · ${failed} failed` : ""}
      </span>
      <button type="button" className="btn btn-sm" onClick={onSync} disabled={syncing}>
        Sync now
      </button>
    </span>
  );
}
