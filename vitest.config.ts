import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

const frontend = { environment: "jsdom", env: { NEXT_PUBLIC_USE_MOCKS: "true" } } as const;

export default defineConfig({
  esbuild: { jsx: "automatic" },
  // realpathSync.native returns the true casing on Windows, so a lowercase drive letter in the
  // working directory cannot load a second copy of React through the alias.
  resolve: { alias: { "@": fs.realpathSync.native(path.resolve(__dirname, "src")) } },
  test: {
    globals: true,
    projects: [
      { extends: true, test: { name: "server", environment: "node", include: ["tests/server/**/*.test.ts"] } },
      { extends: true, test: { name: "contracts", environment: "node", include: ["tests/contracts/**/*.test.ts"] } },
      { extends: true, test: { name: "auth", environment: "node", include: ["tests/auth/**/*.test.ts"] } },
      { extends: true, test: { name: "mocks", environment: "node", include: ["tests/mocks/**/*.test.ts"] } },
      { extends: true, test: { name: "ui", environment: "jsdom", setupFiles: ["tests/ui/setup.ts"], include: ["tests/ui/**/*.test.{ts,tsx}"] } },
      { extends: true, test: { name: "owner", ...frontend, setupFiles: ["src/owner/test/setup.ts"], include: ["tests/owner/**/*.test.{ts,tsx}"] } },
      { extends: true, test: { name: "staff", ...frontend, setupFiles: ["src/staff/test/setup.ts"], include: ["tests/staff/**/*.test.{ts,tsx}"] } },
    ],
  },
});
