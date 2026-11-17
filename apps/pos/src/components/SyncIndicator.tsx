"use client";

import React from "react";

export function SyncIndicator({ pending, onSync }: { pending: number; onSync: () => void }) {
  return (
    <span className="sync-indicator">
      <span className="muted">{pending} to sync</span>
      <button type="button" className="btn btn-sm" onClick={onSync}>
        Sync now
      </button>
    </span>
  );
}
