import fs from "node:fs";
import path from "node:path";
import { createOwnerMockDb, createPosView, type OwnerMockDb, type PosMockDb, type StateStorage } from "@/mocks/owner";

export function fileStorage(dir: string): StateStorage {
  const file = (key: string) => path.join(dir, `${key}.json`);
  return {
    getItem(key) {
      try {
        return fs.readFileSync(file(key), "utf8");
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file(key), value, "utf8");
    },
  };
}

export type SharedMockDb = { owner: OwnerMockDb; pos: PosMockDb };

declare global {
  var __gkMockDb: SharedMockDb | undefined;
}

/** Singleton on globalThis so it survives Next dev hot reloads. Dir: MOCK_DATA_DIR or <cwd>/.mock-data. */
export function getSharedMockDb(): SharedMockDb {
  if (!globalThis.__gkMockDb) {
    const dir = process.env.MOCK_DATA_DIR || path.join(process.cwd(), ".mock-data");
    const owner = createOwnerMockDb({ storage: fileStorage(dir) });
    globalThis.__gkMockDb = { owner, pos: createPosView(owner) };
  }
  return globalThis.__gkMockDb;
}
