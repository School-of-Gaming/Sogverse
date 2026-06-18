import { z } from "zod";

/**
 * next-intl's `t.raw()` returns untyped message trees. This validates the
 * shape we rely on at runtime so the type is earned, and throws loudly on a
 * malformed/missing message (a build-content bug we want to surface).
 */
export function rawStringArray(raw: unknown): string[] {
  return z.array(z.string()).parse(raw);
}
