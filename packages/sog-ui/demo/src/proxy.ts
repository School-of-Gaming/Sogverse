import { NextResponse } from "next/server";

/**
 * A proxy that never runs, and is load-bearing anyway.
 *
 * Next 16 looks for `proxy.ts` by walking up from the app directory to
 * Turbopack's root, and this demo's root has to be the monorepo root: Turbopack
 * treats its root as a chroot, so `node_modules` must sit inside it, and in a
 * hoisted npm-workspaces install that puts it at the repo root. The repo root
 * is also Sogverse's own Next app, which has a `src/proxy.ts` — the real one,
 * with auth, role routing and the per-request CSP. Without a nearer file to find
 * first, the demo build compiles *that* one, fails on its `@/…` aliases, and
 * would otherwise have shipped the host app's auth proxy inside a style guide.
 *
 * So this file exists to be found first. `matcher: []` matches no path, so it is
 * never invoked at runtime; deleting it does not simplify the demo, it re-points
 * the demo at Sogverse's proxy.
 */
export function proxy() {
  return NextResponse.next();
}

export const config = { matcher: [] };
