const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

/**
 * `Secure` when — and only when — the page is served over https.
 *
 * It cannot be unconditional: a `Secure` cookie is silently dropped on
 * `http://localhost:3000`, which is every local dev session and every unit
 * test, so a hardcoded flag would make the locale, timezone and consent
 * cookies look like they simply never persist. Read from `location.protocol`
 * rather than from an env var so the answer is a fact about the document that
 * is doing the writing.
 */
function secureAttribute(): string {
  if (typeof location === "undefined") return "";
  return location.protocol === "https:" ? ";Secure" : "";
}

export function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  // eslint-disable-next-line security/detect-non-literal-regexp -- `name` is always a hardcoded constant at each call site
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Writes a first-party cookie at `path=/`, `SameSite=Lax`.
 *
 * `maxAge` defaults to a year, which is what the locale and timezone
 * preferences want. A caller with its own retention rule passes one — the
 * consent cookie does, because a stored consent (or refusal) is kept for six
 * months and no longer.
 */
export function setCookie(
  name: string,
  value: string,
  options?: { maxAge?: number },
) {
  const maxAge = options?.maxAge ?? COOKIE_MAX_AGE;
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${maxAge};SameSite=Lax${secureAttribute()}`;
}

/**
 * Every domain a cookie on this page could plausibly have been scoped to:
 * the full hostname first, then each parent down to the last two labels.
 *
 * `app.sog.gg` yields `app.sog.gg` and `sog.gg`; `localhost` yields nothing.
 * Stopping at two labels is what keeps the walk from producing a bare TLD, and
 * the browser's own public-suffix rules do the rest — a `domain=` a page is not
 * allowed to set is rejected outright, so over-walking is inert rather than
 * dangerous and no suffix list has to be shipped or kept current.
 */
function cookieDomainCandidates(hostname: string): string[] {
  const labels = hostname.split(".");
  if (labels.length < 2) return [];
  const candidates: string[] = [];
  for (let start = 0; start <= labels.length - 2; start++) {
    candidates.push(labels.slice(start).join("."));
  }
  return candidates;
}

/**
 * Expires a cookie now: once with no `domain` at all, and then once per domain
 * the page could have set it on, walking up from the full hostname.
 *
 * The walk is not defensive padding — it is the only thing that works. A cookie
 * is removed only by an expiry whose name, path *and* domain match the one that
 * set it, and the cookies this exists to clear were not set by us: withdrawing
 * marketing consent has to drop Meta's `_fbp` / `_fbc` and TikTok's `_ttp`,
 * which both scripts write on the **registrable domain** (`.sog.gg`) while our
 * pages are served from a subdomain (`app.sog.gg`, `my.sog.gg`). Expiring at
 * the document's own host alone would match none of them, and the withdrawal
 * would look like it worked while every pixel cookie survived.
 *
 * The domainless write is kept because a host-only cookie — the shape our own
 * `setCookie` produces — is *not* matched by an expiry that names a domain.
 */
export function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  const expiry = "expires=Thu, 01 Jan 1970 00:00:00 GMT;max-age=0";
  document.cookie = `${name}=;path=/;${expiry}`;
  for (const domain of cookieDomainCandidates(location.hostname)) {
    document.cookie = `${name}=;path=/;domain=.${domain};${expiry}`;
  }
}
