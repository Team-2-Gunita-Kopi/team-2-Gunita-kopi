import type { PosData } from "./types";

/**
 * STUB: the real API has no barista-readable catalog endpoint yet (`GET /api/products` is
 * owner-only and answers 501; `GET /api/ingredients` answers 501 too). Wire this to a POS
 * catalog endpoint once the backend provides one (Task 20 adds the Dexie fallback).
 */
export const data: PosData = {
  getCatalog: async () => {
    throw new Error("Catalog API is not available yet.");
  },
};
