import "server-only";
import { createHash } from "node:crypto";

/**
 * What every platform's server conversion report reads off the request and
 * hashes the same way — kept in one place so the platforms cannot disagree
 * about which address a person came from.
 */

/** SHA-256 as lowercase hex, the form every platform takes a hashed field in. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * The address the request came from.
 *
 * `x-forwarded-for` is a list appended to by each hop, so the first entry is the
 * client; `x-real-ip` is the single-value form some proxies send instead.
 * Absent on a request that has no proxy in front of it at all, and then the
 * field is simply omitted — a fabricated address would be worse than none.
 */
export function clientIpFrom(headers: Headers): string | undefined {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip")?.trim() || undefined;
}
