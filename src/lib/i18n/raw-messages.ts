import { z } from "zod";

/**
 * next-intl's `t.raw()` returns untyped message trees. This validates the
 * shape we rely on at runtime so the type is earned, and throws loudly on a
 * malformed/missing message (a build-content bug we want to surface).
 */
export function rawStringArray(raw: unknown): string[] {
  return z.array(z.string()).parse(raw);
}

/**
 * The single-string counterpart. Reach for it when a message must reach the
 * renderer **untouched** — copy that carries markup a component parses itself,
 * where letting next-intl's ICU pass see the tags would mean handing it a tag
 * handler for every one of them, twice over.
 */
export function rawString(raw: unknown): string {
  return z.string().parse(raw);
}
