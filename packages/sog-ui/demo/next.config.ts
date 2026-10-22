import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
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
 * The directory Turbopack and the file tracer both take as their root — they
 * have to agree, or Next warns and overrides one: the nearest one, from here
 * upward, that actually holds the installed `next` package.
 *
 * Turbopack treats its root as a chroot: nothing outside it compiles, and
 * `node_modules` has to sit inside it — which in a hoisted npm-workspaces
 * install means the repo root and nowhere shallower. The file tracer takes the
 * same root, so a later Vercel project rooted at `packages/sog-ui` traces the
 * files the demo actually reads.
 *
 * **Computed, because a checkout can have a lockfile and no install.** A
 * worktree nested inside the main checkout resolves `node_modules` upward, so
 * its own repo root holds no `next`, and a root pinned there answers 500 on
 * every page. Searching for the install finds the repo root in the main
 * checkout and in CI, and the main checkout from a nested one — which still
 * contains every file the demo compiles.
 *
 * The cost of that root is Sogverse's own `src/proxy.ts` sitting beside it. See
 * `demo/src/proxy.ts`, which exists to be found before it.
 */
function workspaceRoot(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  let dir = here;
  for (;;) {
    if (existsSync(path.join(dir, "node_modules", "next", "package.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return here;
    dir = parent;
  }
}

const ROOT = workspaceRoot();

const config: NextConfig = {
  turbopack: { root: ROOT },
  outputFileTracingRoot: ROOT,
  // Left on, `next dev` writes a managed `AGENTS.md` and `CLAUDE.md` into the
  // demo whenever it detects a coding agent; the app's config says why that
  // block is not committed.
  agentRules: false,
};

export default config;
