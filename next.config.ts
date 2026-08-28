import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * The one remote host the image optimizer is allowed to fetch from: this
 * deployment's own Supabase Storage, and only the public `product-images`
 * bucket inside it.
 *
 * **Derived from the env var rather than hardcoded**, because the project ref
 * is part of the hostname and staging and production have different ones — a
 * literal would work on exactly one of them. Each deployment only ever serves
 * its own bucket, so deriving gives each the right single host instead of a
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
 * **If this ever points at a local stack (`http://127.0.0.1:54321`), every
 * banner 400s**: the optimizer refuses to fetch a local-IP origin unless
 * `images.dangerouslyAllowLocalIP` is set, and the error names neither this
 * file nor the flag. No local stack exists today, so the flag is not set here.
 */
function productImagePattern() {
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
    pathname: "/storage/v1/object/public/product-images/**",
  };
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [productImagePattern()],
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
    minimumCacheTTL: 31_536_000,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
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
