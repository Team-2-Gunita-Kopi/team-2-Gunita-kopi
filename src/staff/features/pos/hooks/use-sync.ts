"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "zustand";
import { useConnectivity } from "@/staff/lib/connectivity";
import { getOutboxCounts, outboxStore } from "@/staff/offline/outbox";
import { syncOutboxOrders } from "@/staff/offline/sync";
import { initSyncTriggers } from "@/staff/offline/triggers";

export const CATALOG_REFRESH_MS = 5 * 60 * 1000;

export interface UseSync {
  pendingCount: number;
  failedCount: number;
  syncNow(): Promise<void>;
  isSyncing: boolean;
}

/**
 * Outbox sync state plus the triggers that keep it moving. Mount it once (the POS layout):
 * on login/mount and on `online` / visibility-to-visible it syncs, on reconnect it syncs and
 * refreshes the catalog, and while online it refreshes the catalog every 5 minutes.
 */
export function useSync(): UseSync {
  const queryClient = useQueryClient();
  const { online } = useConnectivity();
  const version = useStore(outboxStore, (s) => s.version);
  const isSyncing = useStore(outboxStore, (s) => s.isSyncing);
  const [counts, setCounts] = useState({ pending: 0, failed: 0 });

  useEffect(() => {
    let live = true;
    void getOutboxCounts().then((c) => live && setCounts(c));
    return () => {
      live = false;
    };
  }, [version]);

  const refreshCatalog = useCallback(() => queryClient.invalidateQueries({ queryKey: ["catalog"] }), [queryClient]);

  const syncNow = useCallback(async () => {
    await syncOutboxOrders();
  }, []);

  // online event, visibilitychange to visible, and an initial sync when online
  useEffect(() => initSyncTriggers(), []);

  // reconnect: sync and refresh the menu
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) {
      void syncOutboxOrders();
      void refreshCatalog();
    }
    wasOnline.current = online;
  }, [online, refreshCatalog]);

  // every 5 minutes while online
  useEffect(() => {
    if (!online) return;
    const id = setInterval(() => void refreshCatalog(), CATALOG_REFRESH_MS);
    return () => clearInterval(id);
  }, [online, refreshCatalog]);

  return { pendingCount: counts.pending, failedCount: counts.failed, syncNow, isSyncing };
}
