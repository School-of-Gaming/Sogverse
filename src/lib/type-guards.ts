/** Narrow an arbitrary string to a key of `obj`. The predicate is backed by a real Object.hasOwn check. */
export function isKeyOf<T extends object>(obj: T, key: PropertyKey): key is keyof T {
  return Object.hasOwn(obj, key);
}

/**
 * Narrow a raw string (typically a `<select>` value) to one of its known
 * options. Returns undefined when the value isn't in the list — for a select
 * rendered from the same options array that's unreachable, but the type is
 * earned by the lookup rather than asserted.
 */
export function findOption<T extends string>(
  options: readonly T[],
  raw: string
): T | undefined {
  return options.find((option) => option === raw);
}
