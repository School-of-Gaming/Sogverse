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
        // global state far more than the node ones do.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "dom",
          environment: "jsdom",
          setupFiles: ["./tests/setup.ts"],
          include: roots.map((root) => `${root}/**/*.{test,spec}.tsx`),
          globals: true,
          // Forks, and the same pool as the node project — both halves of that
          // are load-bearing. Forks because tests that pin a timezone assign
          // `process.env.TZ` at runtime, which a child process honours and a
          // worker thread ignores (the failure only shows on a UTC runner; a
          // developer's box in Helsinki hides it). The same pool because
          // Vitest sizes a pool per pool type and runs projects concurrently,
          // so two pool types put two full-sized pools on the machine at once
          // — on a 4-vCPU runner that doubled the summed collect and test
          // time, and on a developer's box it saturates every core.
          pool: "forks",
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
          // Isolated, like the dom project: un-isolated measured no faster
          // once there is no jsdom to rebuild per file (what it saves is the
          // realm, not the imports), and it would let a shared module keep
          // the mocks that were live when some earlier file first loaded it.
          // Same pool as the dom project, for the reason given there.
          pool: "forks",
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
