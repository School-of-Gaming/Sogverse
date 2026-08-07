/**
 * Rendering values into SQL literals.
 *
 * `standard_conforming_strings` is on (the default since 9.1), so a backslash is
 * an ordinary character and doubling the quote is the whole escape. What makes
 * that safe to rely on is the literal-safety gate in `ingest.mjs`, which refuses
 * any value that would make the assumption interesting — control characters and
 * empty strings — before a generator gets this far.
 */

/** A Postgres text literal, or `NULL::text`. */
export function sqlText(value) {
  if (value === null || value === undefined) return "NULL::text";
  return `'${value.replace(/'/g, "''")}'`;
}

/** A bigint literal, or `NULL::bigint`. The cast matters: a VALUES column whose
 * every row is a bare NULL infers as text, and the parent join would then be
 * comparing text to bigint. */
export function sqlBigint(value) {
  if (value === null || value === undefined) return "NULL::bigint";
  if (!Number.isSafeInteger(value)) throw new Error(`not a safe integer: ${value}`);
  return `${value}::bigint`;
}

/**
 * A jsonb literal, or `NULL::jsonb` for an empty map — `name_i18n` holds only
 * the locales that differ from `name`, so a row with none carries no object at
 * all, matching every hand-written seed before it.
 *
 * Keys are emitted in sorted order. `JSON.stringify` preserves insertion order,
 * which is the order the locale list happened to be in; sorting makes the
 * emitted literal a function of the data alone.
 */
export function sqlJsonb(map) {
  const keys = Object.keys(map).sort();
  if (keys.length === 0) return "NULL::jsonb";
  const object = {};
  for (const key of keys) object[key] = map[key];
  return `${sqlText(JSON.stringify(object))}::jsonb`;
}
