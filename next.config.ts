import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * The one remote host the image optimizer is allowed to fetch from: this
 * deployment's own Supabase Storage, and only the public buckets named below
 * inside it. **One pattern per bucket** — `remotePatterns` matches on the
 * pathname, so a bucket that is not listed here is not optimizable, which is
 * the point: the host is shared, the permission is not.
 *
 * **Derived from the env var rather than hardcoded**, because the project ref
 * is part of the hostname and staging and production have different ones — a
 * literal would work on exactly one of them. Each deployment only ever serves
 * its own buckets, so deriving gives each the right single host instead of a
 * wildcard that would let the optimizer proxy any Supabase project on the
 * internet.
 *
 * **Missing env is a hard build failure, deliberately.** The soft option —
 * omitting the pattern — trades a loud failure here for a silent one later:
 * `next/image` rejects an unconfigured host at request time, so every product
 * picture on the site would 400 while the build went green. This config is
 * only loaded by `next dev`/`build`/`start`, all of which already require the
 * same variable for Supabase itself (the URL resolver throws on it too), so
 * there is no tooling context that legitimately loads it without one.
 *
 * **Pointed at a local stack (`http://127.0.0.1:61023`), every banner 400s
 * unless `images.dangerouslyAllowLocalIP` is set**, and the error names neither
 * this file nor the flag. `npm run db -- up` writes exactly such a URL into
 * `.env.local`, and the rich seed puts a picture on every product, so the flag
 * is set — see `supabaseIsLocal` below for the one condition under which.
 */
function bucketPattern(bucket: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set — images.remotePatterns cannot be built",
    );
  }
  const { protocol, hostname, port } = new URL(base);
  return {
    // `URL.protocol` keeps its trailing colon; the image config wants it bare.
    protocol: protocol.replace(/:$/, "") as "http" | "https",
    hostname,
    port,
    pathname: `/storage/v1/object/public/${bucket}/**`,
  };
}

/**
 * Is the configured Supabase a local stack? Loopback and nothing else — a name
 * that resolves to one is not covered and does not need to be, because the
 * local-stack script writes a literal `http://127.0.0.1:<port>`.
 *
 * Missing env is `false` rather than a throw: `bucketPattern` above already
 * fails the build loudly on it, and one failure is enough.
 */
function supabaseIsLocal() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return false;
  const { hostname } = new URL(base);
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

/**
 * The directory Turbopack treats as the workspace root: the nearest one, from
 * here upward, that actually holds the installed `next` package.
 *
 * **Computed, because a checkout can have a lockfile and no install.** Work in
 * flight lives in checkouts nested inside the main one, which resolve
 * `node_modules` upward rather than carrying their own. Turbopack's default is
 * the directory of the *nearest lockfile*, it compiles nothing outside its
 * root, and a nested checkout's nearest lockfile is its own — so left to the
 * default, its dev server cannot find `next` and answers 500 on every route.
 * In the main checkout and in CI this resolves to the repo root, which is what
 * the default picks there anyway; in a nested checkout it resolves to the main
 * one, which still contains it, so every file being compiled stays inside the
 * root.
 *
 * Falls back to this directory when no ancestor holds the package, which is
 * the default's own answer and leaves a missing install to fail as itself.
 */
function workspaceRoot(): string {
  let dir = __dirname;
  for (;;) {
    if (existsSync(path.join(dir, "node_modules", "next", "package.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return __dirname;
    dir = parent;
  }
}

const nextConfig: NextConfig = {
  turbopack: { root: workspaceRoot() },
  // `next dev` otherwise writes a managed `nextjs-agent-rules` block into
  // `CLAUDE.md` and `AGENTS.md` whenever it detects a coding agent, pointing it
  // at the version-matched docs vendored in `node_modules/next/dist/docs/`.
  // Those docs are worth reading — they are what identified `partialPrefetching`
  // as the App Shell mechanism this app's `<Link>` prefetch default is waiting
  // on (`src/i18n/navigation.tsx`) — but they are worth reading at the moment a
  // version-specific question comes up, from the package, not as standing
  // instructions committed to the repo. Left on, the block reappears in
  // `git status` after every `next dev` and rewrites itself on every upgrade.
  agentRules: false,
  // `sharp` is a native module: it loads a platform-specific binary at require
  // time, which a bundler cannot trace and must not try to inline. Naming it
  // here leaves it as a plain runtime `require` in the two upload routes that
  // import it — the only places in the app that do — so its ~20 MB lands on
  // those functions and nowhere else.
  serverExternalPackages: ["sharp"],
  // The Open Graph cards read two vendored font files off disk at request time
  // (`src/components/og/fonts.ts`). A `process.cwd()` read is invisible to the
  // bundler's tracer, so the files have to be named here or they are simply not
  // deployed beside the handlers — and a card with no fonts is a card satori
  // draws in nothing.
  outputFileTracingIncludes: {
    "/opengraph-images/**": ["./src/assets/fonts/*.ttf"],
  },
  images: {
    // Derived from the configured URL, never from NODE_ENV: what decides
    // whether the optimizer may fetch a loopback origin is whether the bucket
    // it is pointed at IS one. A deployment's URL is a public hostname, so this
    // is false everywhere but a checkout running against `npm run db -- up`.
    dangerouslyAllowLocalIP: supabaseIsLocal(),
    remotePatterns: [
      bucketPattern("product-images"),
      // Gedu session-report photos. They go through the optimizer for the same
      // reason product banners do and a stronger one: a family feed card can
      // show five of them, unpaged, and serving ~300 KB masters into 200 px
      // thumbnails is the real delivery cost of the feature.
      bucketPattern("session-images"),
    ],
    // WebP only — AVIF was weighed and rejected (owner decision, 2026-08-18).
    // AVIF saves a further ~20–30% over WebP but its encode is far slower, and
    // the encode is paid synchronously by the FIRST visitor to each
    // (image, width) — in front of the detail hero, the page's LCP element.
    // At this site's traffic (~300 DAU; product pages see a visit or two a
    // day) that first-encounter tail is a large share of all real visits, and
    // on thin routes those slow hits land in the p75 Speed Insights grades
    // (docs/architecture/performance.md: "on a thin enough route, p75 IS the cold number"),
    // while AVIF's byte saving amortizes to nothing at the same traffic.
    // Costs concentrate where we are measured; benefits don't. This is
    // traffic-dependent — revisit if the site grows busy enough that first
    // encounters become statistical noise.
    formats: ["image/webp"],
    // One year, and this value alone decides it: the optimizer caches an entry
    // for `max(minimumCacheTTL, the upstream's own Cache-Control max-age)`, so
    // the config is a floor rather than something the stored header can
    // undercut. Next's own default is four hours, which would have the
    // optimizer re-fetching the bucket six times a day for bytes that cannot
    // have moved — exactly the Supabase egress this change exists to stop.
    // Safe because a bucket path is immutable *by construction*: an object is
    // named for the sha256 of its own bytes (`<sha256>.<ext>`), uploaded with
    // `upsert: false`, and never written over — a URL whose bytes changed
    // would be a URL that no longer matched its own name. Replacing a
    // product's picture points it at a different object, which is a cache miss
    // by construction; uploading the same file twice resolves to the object
    // already there, which is a hit.
    //
    // A session photo's name is immutable for a different reason with the same
    // force: it is the row's own random UUID, uploaded with `upsert: false` and
    // never reused, so a URL's bytes cannot change either. The one consequence
    // worth naming is that a deleted photo's cached variants can outlive its
    // object — harmless, because nothing renders a photo whose row is gone, and
    // the acceptance criterion for deletion is stated against the raw bucket
    // URL rather than an optimizer variant.
    minimumCacheTTL: 31_536_000,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // **`strict-origin`, not `strict-origin-when-cross-origin`.** The
          // difference is what a SAME-ORIGIN navigation hands the next document,
          // and several of our URLs are secrets: a password-reset link, a PIN
          // reset, an email verification, a seat offer. Under the default, a
          // parent following `?token_hash=…` and then landing on the login page
          // gives that page a `document.referrer` carrying the token — and the
          // Meta Pixel reports the referrer with every event. `strict-origin`
          // sends the bare origin everywhere, so a token cannot travel in a
          // referrer at all. Nothing in the app reads the Referer header, so
          // there is nothing on our side to lose by it.
          {
            key: "Referrer-Policy",
            value: "strict-origin",
          },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          // CSP is set dynamically per-request in proxy.ts with a unique nonce
          // (nonce-based script-src blocks injected inline scripts in production)
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
