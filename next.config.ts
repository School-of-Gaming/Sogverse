import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
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
  async redirects() {
    // TEMPORARY: the old products-v2 storefront routes (/clubs, /camps,
    // /events + their /[id] detail pages) are retired in favor of /shop.
    // The source is kept in the tree for reference. These redirects make the
    // routes unreachable for everyone (signed in or out); remove this whole
    // block as part of the full delete when /shop ships. See TODO.md.
    return [
      { source: "/clubs/:path*", destination: "/shop", permanent: false },
      { source: "/camps/:path*", destination: "/shop", permanent: false },
      { source: "/events/:path*", destination: "/shop", permanent: false },
    ];
  },
};

export default withNextIntl(nextConfig);
