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
    // AVIF ahead of WebP. Both are negotiated per request from `Accept`, and
    // the encode is paid once per (url, width, quality) and then cached — so
    // the extra encode cost is one-off while the ~20–30% saving over WebP is
    // paid back on every fetch. Egress is the whole reason this optimizer is
    // here.
    formats: ["image/avif", "image/webp"],
    // One year. The optimizer would otherwise honour the *stored* object's
    // `cacheControl` metadata, and re-fetch the origin every hour — exactly
    // the Supabase egress this change exists to stop. Safe because a bucket
    // path is immutable: both admin product routes mint a fresh
    // `${randomUUID()}.${ext}` per upload with `upsert: false` and delete the
    // superseded object, so a given URL's bytes never change. Replacing a
    // product's picture produces a new URL, which is a cache miss by
    // construction.
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
