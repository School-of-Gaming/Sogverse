/**
 * The address a request came from, or `undefined` when no proxy in front of
 * the app said.
 *
 * `x-forwarded-for` is a list appended to by each hop, so the first entry is the
 * client; `x-real-ip` is the single-value form some proxies send instead. On
 * Vercel the platform writes the header itself, overwriting whatever the client
 * sent, so the first entry is the platform's word rather than the caller's.
 * Absent on a request that has no proxy in front of it at all; a fabricated
 * address would be worse than none, so the caller decides what absence means.
 */
export function clientIpFrom(headers: Headers): string | undefined {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip")?.trim() || undefined;
}
