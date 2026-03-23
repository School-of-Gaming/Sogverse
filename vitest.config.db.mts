import { defineConfig } from "vitest/config";
import path from "path";

// Vitest auto-loads .env.test.local when mode is "test" (the default).
// CI sets env vars directly in the workflow YAML instead.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/db/setup.ts"],
    include: ["tests/db/**/*.test.ts"],
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 15_000,
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
