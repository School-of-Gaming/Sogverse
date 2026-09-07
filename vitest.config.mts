import { defineConfig, coverageConfigDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const alias = {
  "@": path.resolve(__dirname, "./src"),
  // Stub Next.js's `server-only` marker so route handlers that import it
  // (transitively or directly) can be imported into Vitest tests.
  "server-only": path.resolve(__dirname, "./tests/mocks/server-only.ts"),
};

const roots = ["tests/unit", "tests/integration"];

export default defineConfig({
  test: {
    projects: [
      {
        // Component tests. A `.tsx` file renders React, so it gets jsdom by
        // extension and stays isolated — component suites lean on module and
        // global state far more than the node ones do. The pool is left at the
        // default: threads and forks measured the same here, within noise, and
        // forks is the one that keeps a leaked jsdom global from reaching the
        // next file.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "dom",
          environment: "jsdom",
          setupFiles: ["./tests/setup.ts"],
          include: roots.map((root) => `${root}/**/*.{test,spec}.tsx`),
          globals: true,
        },
      },
      {
        // Everything else. Booting a jsdom realm per file is the single
        // largest cost in this suite, and the overwhelming majority of `.ts`
        // tests never touch the DOM. The handful that do declare
        // `// @vitest-environment jsdom` at the top of the file.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          setupFiles: ["./tests/setup.ts"],
          include: roots.map((root) => `${root}/**/*.{test,spec}.ts`),
          globals: true,
          // Nothing here holds a DOM or a global that outlives its file, so a
          // fresh realm per file buys nothing and costs the bulk of the run.
          // The price is that a test must not depend on being handed fresh
          // module state — proved by running this project shuffled.
          isolate: false,
          // Measurably faster than forks for this project (roughly a tenth off
          // the wall clock, and half off transform and setup), with no DOM
          // globals to leak between files.
          pool: "threads",
        },
      },
    ],
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: [
        ...coverageConfigDefaults.exclude,
        "tests/",
        ".next/",
        "**/types/**",
      ],
    },
  },
});
