import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@gunita/contracts": path.resolve(
        __dirname,
        "../../packages/contracts/src",
      ),
      "@gunita/auth": path.resolve(__dirname, "../../packages/auth/src"),
      "@gunita/db-types": path.resolve(
        __dirname,
        "../../packages/db-types/src",
      ),
    },
  },
});
