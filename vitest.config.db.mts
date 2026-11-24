import { defineConfig } from "vitest/config";
import path from "path";

// Vitest auto-loads .env.test.local when mode is "test" (the default).
// CI sets env vars directly in the workflow YAML instead.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/db/setup.ts"],
    include: ["tests/db/**/*.test.ts"],
    // UTC, as CI and the production servers run, so no test leans on its author's zone.
    env: { TZ: "UTC" },
    pool: "forks",
    fileParallelism: false,
    testTimeout: 15_000,
    // The setup's afterAll closes the shared connection pool; "stack" runs it
    // after every file's own afterAll, which may still be cleaning up.
    sequence: { hooks: "stack" },
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
