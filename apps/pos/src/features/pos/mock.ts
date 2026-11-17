import { mockRpc } from "@/lib/mock-db";
import type { PosCatalog, PosData } from "./types";

// `listCatalog` throws Error("Offline") while offline; the Dexie fallback arrives in Task 20.
export const data: PosData = {
  getCatalog: () => mockRpc<PosCatalog>("listCatalog"),
};
