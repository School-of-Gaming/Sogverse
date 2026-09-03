import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/**
 * The demo app.
 *
 * It is run with Next's directory argument (`next dev demo`) from the package
 * root, so the app lives here while `package.json`, the library source and the
 * tokens stay one level up — and a page reaches the tokens by relative path
 * across that boundary.
 */

/**
 * The monorepo root, three levels up from this file, and the answer to two
 * questions that have to agree (Next warns and overrides one if they do not).
 *
 * Turbopack treats its root as a chroot: nothing outside it compiles, and
 * `node_modules` has to sit inside it — which in a hoisted npm-workspaces
 * install means the repo root and nowhere shallower. The file tracer takes the
 * same root, so a later Vercel project rooted at `packages/sog-ui` traces the
 * files the demo actually reads.
 *
 * The cost of that root is Sogverse's own `src/proxy.ts` sitting beside it. See
 * `demo/src/proxy.ts`, which exists to be found before it.
 */
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

const config: NextConfig = {
  turbopack: { root: REPO_ROOT },
  outputFileTracingRoot: REPO_ROOT,
};

export default config;
