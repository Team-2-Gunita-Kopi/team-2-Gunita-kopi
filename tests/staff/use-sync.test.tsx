import "fake-indexeddb/auto";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { connectivityStore } from "@/staff/lib/connectivity";
import { posDb } from "@/staff/offline/db";
import { saveOrderToOutbox, markOrderStatus } from "@/staff/offline/outbox";
import { CATALOG_REFRESH_MS, useSync } from "@/staff/features/pos/hooks/use-sync";

vi.mock("@/staff/offline/sync", async (orig) => ({
  ...(await orig<typeof import("@/staff/offline/sync")>()),
  syncOutboxOrders: vi.fn(async () => ({ total: 0, synced: 0, failed: 0 })),
}));
vi.mock("@/staff/offline/triggers", () => ({ initSyncTriggers: () => () => {} }));

const order = (id: string) => ({
  clientTxId: id, type: "dine-in" as const, items: [], totalAmount: 0, taxAmount: 0, discountAmount: 0, paidAmount: 0, paymentMethod: "cash" as const,
});

function setup() {
  const client = new QueryClient();
  const spy = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { spy, ...renderHook(() => useSync(), { wrapper }) };
}

beforeEach(async () => {
  connectivityStore.setState({ browserOnline: true, simulatedOffline: false });
  await posDb.ordersOutbox.clear();
});
afterEach(() => vi.useRealTimers());

describe("useSync", () => {
  it("reports pending and failed counts", async () => {
    const { result } = setup();
    await saveOrderToOutbox(order("a"));
    await saveOrderToOutbox(order("b"));
    await markOrderStatus("b", "failed", "nope");
    await waitFor(() => expect(result.current).toMatchObject({ pendingCount: 1, failedCount: 1, isSyncing: false }));
  });

  it("refreshes the catalog every 5 minutes while online, and on reconnect", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { spy } = setup();
    expect(spy).not.toHaveBeenCalled();
    await act(async () => void vi.advanceTimersByTime(CATALOG_REFRESH_MS));
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => connectivityStore.setState({ simulatedOffline: true }));
    await act(async () => void vi.advanceTimersByTime(CATALOG_REFRESH_MS));
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => connectivityStore.setState({ simulatedOffline: false }));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
