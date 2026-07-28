import { z } from "zod";

// Sound, cast-free readers for the loosely-typed `Json` payloads that RPCs and
// route handlers return (`{ data, error }.data`, `await response.json()`). Each
// validates at runtime via zod and returns a real typed value — no
// `(x as { … }).field` assertions, so no `no-unsafe-type-assertion` violations.
// A malformed payload throws loudly, which is the right behaviour in a test.

const objectSchema = z.record(z.string(), z.unknown());

/**
 * Narrow a loosely-typed value (a `vi.fn()` mock-call argument, a console line)
 * to a string. Same contract as the field readers below: validates at runtime
 * and throws loudly on a mismatch, so no assertion is needed at the call site.
 */
export function asString(value: unknown): string {
  return z.string().parse(value);
}

/** Narrow a loosely-typed value to a plain object, for key/shape assertions. */
export function asObject(value: unknown): Record<string, unknown> {
  return objectSchema.parse(value);
}

/** Read a required string field. Throws if absent or not a string. */
export function getString(value: unknown, key: string): string {
  return z.string().parse(objectSchema.parse(value)[key]);
}

/** Read a required number field. Throws if absent or not a number. */
export function getNumber(value: unknown, key: string): number {
  return z.number().parse(objectSchema.parse(value)[key]);
}

/** Read a required boolean field. Throws if absent or not a boolean. */
export function getBoolean(value: unknown, key: string): boolean {
  return z.boolean().parse(objectSchema.parse(value)[key]);
}

/** Read a required `Record<string, string>` field (e.g. apply_group_changes'
 *  `tempMap`). Throws if absent or not a string→string map. */
export function getStringRecord(
  value: unknown,
  key: string,
): Record<string, string> {
  return z.record(z.string(), z.string()).parse(objectSchema.parse(value)[key]);
}
