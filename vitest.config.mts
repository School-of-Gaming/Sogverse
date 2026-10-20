import { defineConfig, coverageConfigDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";
import path from "path";

// The workspace package from this checkout, one alias per JS entry in its
// package.json `exports` (a stylesheet entry is never imported by a test).
// Resolved through node_modules instead, a worktree gets the main checkout's
// copy — it has no node_modules of its own — so its tests would exercise the
// wrong code and the affected-test walk would miss its changes.
const sogUiRoot = path.resolve(__dirname, "./packages/sog-ui");
const sogUiExports: Record<string, unknown> = JSON.parse(
  readFileSync(path.join(sogUiRoot, "package.json"), "utf8"),
).exports;
const sogUiAlias = Object.entries(sogUiExports).flatMap(([subpath, target]) => {
  // A conditional or wildcard export would need resolving here; fail loudly
  // rather than let it fall back to node_modules.
  if (typeof target !== "string" || subpath.includes("*")) {
    throw new Error(`vitest.config.mts: cannot alias the @sog/ui export ${subpath}`);
  }
  if (!/\.[cm]?[jt]sx?$/.test(target)) return [];
  const specifier = `@sog/ui${subpath.slice(1)}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [{ find: new RegExp(`^${specifier}$`), replacement: path.join(sogUiRoot, target) }];
});

const alias = [
  { find: "@", replacement: path.resolve(__dirname, "./src") },
  // Stub Next.js's `server-only` marker so route handlers that import it
  // (transitively or directly) can be imported into Vitest tests.
  { find: "server-only", replacement: path.resolve(__dirname, "./tests/mocks/server-only.ts") },
  ...sogUiAlias,
];

const roots = ["tests/unit", "tests/integration"];

// Every run is in UTC, whatever zone the machine is in: it is what CI and the
// production servers run, so a test that silently leans on the developer's
// own zone fails on their machine instead of after a push. A test about a
// viewer's zone pins one itself.
const env = { TZ: "UTC" };

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
          env,
          include: roots.map((root) => `${root}/**/*.{test,spec}.tsx`),
          globals: true,
          // Forks, and the same pool as the node project — both halves of that
          // are load-bearing. Forks because a test's timezone pin and the
          // config's UTC default are both runtime assignments to `TZ`, which a
          // child process honours and a worker thread ignores — under threads
          // neither takes effect and tests run in the machine's zone. The same
          // pool because Vitest sizes a pool per pool type and runs projects
          // concurrently, so two pool types put two full-sized pools on the
          // machine at once — on a 4-vCPU runner that doubled the summed
          // collect and test time, and on a developer's box it saturates
          // every core.
          pool: "forks",
          // next-intl ships ESM that imports `next/server` by its bare
          // specifier. Externalised, Node's own resolver handles that import
          // and cannot find it (Next exposes it through package exports, which
          // the raw resolver does not consult from inside another package's
          // ESM); inlined, Vite resolves it the way it resolves the app's own
          // imports. The proxy suite is what pulls it in.
          server: { deps: { inline: ["next-intl"] } },
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
          env,
          include: roots.map((root) => `${root}/**/*.{test,spec}.ts`),
          globals: true,
          // Isolated, like the dom project: un-isolated measured no faster
          // once there is no jsdom to rebuild per file (what it saves is the
          // realm, not the imports), and it would let a shared module keep
          // the mocks that were live when some earlier file first loaded it.
          // Same pool as the dom project, for the reason given there.
          pool: "forks",
          // next-intl ships ESM that imports `next/server` by its bare
          // specifier. Externalised, Node's own resolver handles that import
          // and cannot find it (Next exposes it through package exports, which
          // the raw resolver does not consult from inside another package's
          // ESM); inlined, Vite resolves it the way it resolves the app's own
          // imports. The proxy suite is what pulls it in.
          server: { deps: { inline: ["next-intl"] } },
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
