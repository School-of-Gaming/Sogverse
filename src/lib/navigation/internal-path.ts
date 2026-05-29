/**
 * Safe resolution of a caller-supplied redirect target to an *internal*
 * path. The recurring problem this solves: we frequently want to bounce a
 * user to a destination carried in a query param (`?back=`, `?next=`,
 * `?redirect=`) — but only ever to a page inside our own app, never to an
 * attacker-controlled external origin (open-redirect → phishing).
 *
 * The robust approach is NOT string pattern-matching (`startsWith("//")`
 * and friends always lose to a variant you didn't think of — `/\evil.com`,
 * `https:/evil.com`, a leading tab, percent-encoded forms). Instead we
 * resolve the candidate with the WHATWG URL parser against a *fixed
 * sentinel origin* and accept it only if it did not escape that origin.
 *
 * Resolving against a constant sentinel — not the real request origin — is
 * what makes this host-agnostic: it behaves identically on localhost, prod,
 * staging, and Vercel preview deployments (whose hostnames are generated
 * per branch and aren't known ahead of time). We never need to know our own
 * hostname; we only need to know whether the candidate stayed relative.
 *
 * Examples that resolve to a DIFFERENT origin and are therefore rejected
 * (→ fallback): `//evil.com`, `/\evil.com` (backslashes normalize to
 * slashes for special schemes), `https://evil.com`, `https:/evil.com`,
 * `\t//evil.com` (the parser strips tabs/newlines, then it's `//evil.com`).
 * A genuine in-app path like `/gedu/clubs/123?x=1#h` stays on the sentinel
 * origin and is returned as `/gedu/clubs/123?x=1#h`.
 */

// Any absolute base works; `.invalid` is reserved by RFC 2606 so it can
// never collide with a real origin.
const SENTINEL_ORIGIN = "https://internal.invalid";

/**
 * Returns `candidate` as a safe internal path (pathname + search + hash) if
 * it resolves to a same-origin destination, otherwise `fallback`.
 *
 * @param candidate Raw value from a query param. Arrays (Next.js repeats a
 *   query key as `string[]`) use the first entry; `null`/`undefined`/empty
 *   fall back.
 * @param fallback Where to send the user when the candidate is missing or
 *   unsafe — typically a role dashboard or `/`.
 */
export function resolveInternalPath(
  candidate: string | string[] | null | undefined,
  fallback: string,
): string {
  const raw = Array.isArray(candidate) ? candidate[0] : candidate;
  if (typeof raw !== "string" || raw.length === 0) return fallback;

  let url: URL;
  try {
    url = new URL(raw, SENTINEL_ORIGIN);
  } catch {
    return fallback;
  }

  // If the candidate escaped the sentinel origin it pointed off-site —
  // refuse it. This single check subsumes every protocol-relative,
  // backslash, absolute-URL, and whitespace-smuggling variant.
  if (url.origin !== SENTINEL_ORIGIN) return fallback;

  return `${url.pathname}${url.search}${url.hash}`;
}
