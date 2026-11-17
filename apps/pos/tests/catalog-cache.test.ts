import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOwnerMockDb, createPosView } from "@gunita/mocks/owner";
import { connectivityStore } from "@/lib/connectivity";
import { posDb } from "@/offline/db";
import { readCatalog, saveCatalog } from "@/offline/catalog-cache";
import { posData } from "@/features/pos";

let view: Record<string, (...a: unknown[]) => unknown>;
let fetchFails = false;

beforeEach(async () => {
  connectivityStore.setState({ browserOnline: true, simulatedOffline: false });
  await posDb.productsCache.clear();
  await posDb.ingredientsCache.clear();
  await posDb.meta.clear();
  fetchFails = false;
  const db = createOwnerMockDb({ storage: null, now: () => new Date("2026-11-16T06:00:00Z") });
  view = createPosView(db) as unknown as Record<string, (...a: unknown[]) => unknown>;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      if (fetchFails) throw new Error("network down");
      const { op, args } = JSON.parse(init.body) as { op: string; args: unknown[] };
      return { json: async () => ({ ok: true, data: view[op]!(...args) ?? null }) } as Response;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("catalog cache", () => {
  it("readCatalog is null before anything is saved", async () => {
    expect(await readCatalog()).toBeNull();
  });

  it("online getCatalog fetches and saves the full catalog incl. recipes", async () => {
    const fresh = await posData.getCatalog();
    const cached = await readCatalog();
    expect(cached).not.toBeNull();
    expect(cached!.products).toEqual(fresh.products);
    expect(cached!.ingredients).toEqual(fresh.ingredients);
    expect(cached!.settings).toEqual(fresh.settings);
    expect(cached!.updatedAt).toBe(fresh.updatedAt);
    expect(fresh.products.some((p) => (p.ingredients?.length ?? 0) > 0)).toBe(true);
  });

  it("offline getCatalog returns the cached products with updatedAt", async () => {
    const fresh = await posData.getCatalog();
    connectivityStore.setState({ simulatedOffline: true });
    const offline = await posData.getCatalog();
    expect(offline.products).toEqual(fresh.products);
    expect(offline.updatedAt).toBe(fresh.updatedAt);
  });

  it("falls back to the cache when the fetch fails while online", async () => {
    const fresh = await posData.getCatalog();
    fetchFails = true;
    expect((await posData.getCatalog()).updatedAt).toBe(fresh.updatedAt);
  });

  it("offline with an empty cache throws the exact message", async () => {
    connectivityStore.setState({ simulatedOffline: true });
    await expect(posData.getCatalog()).rejects.toThrow(
      "No saved menu yet. Connect to the internet once to download it.",
    );
  });

  it("online fetch failure with an empty cache throws the saved-menu message", async () => {
    fetchFails = true;
    await expect(posData.getCatalog()).rejects.toThrow(
      "No saved menu yet. Connect to the internet once to download it.",
    );
  });

  it("saveCatalog replaces earlier rows", async () => {
    const fresh = await posData.getCatalog();
    await saveCatalog({ ...fresh, products: fresh.products.slice(0, 1) });
    expect((await readCatalog())!.products).toHaveLength(1);
  });
});
