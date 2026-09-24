/**
 * Reading a `dataLayer` back, for the suites that assert on what the Tag
 * Manager container was told.
 *
 * A consent command is pushed as an **`arguments` object** rather than as an
 * array, and that is a property under test rather than an implementation
 * detail: the container reads an arguments object as a command and an ordinary
 * array as three numbered keys to merge into its data model, so a container
 * that never sees the command behaves exactly like one that ignores consent.
 *
 * Both halves of reading one live here rather than in a copy per suite, because
 * the second copy is always the one that quietly stops asserting the form.
 */

/** Whether a queue entry is a real `arguments` object — the command form. */
export function isArgumentsObject(entry: unknown): boolean {
  return Object.prototype.toString.call(entry) === "[object Arguments]";
}

function isArrayLike(value: unknown): value is ArrayLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "length" in value &&
    typeof value.length === "number"
  );
}

/**
 * A pushed command's values, read back off the arguments object. An entry that
 * is not array-like at all reads as no values rather than throwing, so a
 * regression to a plain object or array push fails on the caller's own
 * comparison instead of inside this helper.
 */
export function commandValues(entry: unknown): unknown[] {
  return isArrayLike(entry) ? Array.from(entry) : [];
}
