/**
 * Resolve the origin to use for Stripe Checkout success/cancel redirects (and
 * any other place we need to send the user back to "the site they came from").
 *
 * The browser-supplied `Host` header is attacker-controllable and MUST NOT be
 * trusted blindly: an attacker can craft a checkout where Stripe redirects the
 * victim's browser to `https://evil.com/...` after payment. So we accept the
 * incoming Host only if it matches a trusted source we already know about.
 *
 * Trusted sources, in priority order:
 *   1. `VERCEL_URL` — Vercel-injected per-deploy hostname. Not user-controllable.
 *      Covers per-PR preview deploys (Kyle tests on these).
 *   2. `VERCEL_BRANCH_URL` — Vercel-injected branch alias hostname.
 *   3. The host of `NEXT_PUBLIC_SITE_URL` — configured per environment in
 *      Vercel's project settings: prod = sogverse.sog.gg, preview =
 *      sogverse-staging.sog.gg, local = localhost:3000.
 *   4. localhost (only when NODE_ENV !== "production") for `npm run dev`.
 *
 * If the incoming Host matches a trusted source, return its origin (so the
 * redirect lands back on the same URL the user was browsing from). Otherwise
 * fall back to the canonical `NEXT_PUBLIC_SITE_URL` — an attacker spoofing
 * `Host: evil.com` lands the victim on our own site, not theirs.
 */
export function getOrigin(request: Request): string {
  const host = request.headers.get("host") ?? "";

  const trusted = new Set<string>();
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      trusted.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).host);
    } catch {
      // Malformed env — fall through; the fallback at the bottom still
      // protects us.
    }
  }
  if (process.env.VERCEL_URL) trusted.add(process.env.VERCEL_URL);
  if (process.env.VERCEL_BRANCH_URL) trusted.add(process.env.VERCEL_BRANCH_URL);
  if (process.env.NODE_ENV !== "production") {
    trusted.add("localhost:3000");
    trusted.add("127.0.0.1:3000");
  }

  if (host && trusted.has(host)) {
    const protocol =
      host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https";
    return `${protocol}://${host}`;
  }

  // Untrusted Host — fall back to the canonical configured URL. If
  // NEXT_PUBLIC_SITE_URL itself is missing we can't safely produce an origin;
  // refuse rather than guess.
  if (!process.env.NEXT_PUBLIC_SITE_URL) {
    throw new Error("NEXT_PUBLIC_SITE_URL is not configured");
  }
  return process.env.NEXT_PUBLIC_SITE_URL;
}
