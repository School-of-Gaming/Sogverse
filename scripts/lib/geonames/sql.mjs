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
 * The guarded INSERT that puts a set of ingested rows into `locations`.
 *
 * Shared by the seed generator and the differ deliberately: a row inserted by a
 * reconciliation has to land exactly as a row inserted by the seed would have,
 * or the two paths produce subtly different trees over time. The seed calls it
 * once per chunk of 2,000 and the differ once per level with whatever upstream
 * added, and neither knows anything the other does not.
 *
 * Each row is joined to its parent by the parent's `geonames_id`, and guarded
 * on its own — so the statement depends on the levels above it having landed
 * and re-running it inserts nothing. Both the join and the guard come in a
 * second form, chosen by the data rather than by the country: where the config
 * declared synthetic rows, which have no geonameid to key on, the key is
 * `(type, external_code)` instead.
 */
export function locationInsert(iso, level, rows) {
  const anySyntheticRow = rows.some((row) => row.geonameid === null);
  const anySyntheticParent = rows.some((row) => row.parent.geonameid === null);

  const values = rows
    .map(
      (row) =>
        `    (${sqlBigint(row.geonameid)}, ${sqlText(row.name)}, ${sqlJsonb(row.nameI18n)}, ` +
        `${sqlText(row.externalCode)}, ${sqlBigint(row.parent.geonameid)}, ` +
        `${sqlText(row.parent.type)}, ${sqlText(row.parent.externalCode)})`,
    )
    .join(",\n");

  const parentMatch = anySyntheticParent
    ? ` AND CASE WHEN v.parent_geonames_id IS NULL\n` +
      `          THEN p.external_code = v.parent_external_code\n` +
      `          ELSE p.geonames_id = v.parent_geonames_id\n` +
      `     END\n`
    : ` AND p.geonames_id = v.parent_geonames_id\n`;

  const guard = anySyntheticRow
    ? `  SELECT 1 FROM public.locations l\n` +
      `   WHERE CASE WHEN v.geonames_id IS NULL\n` +
      `              THEN l.country_code = ${sqlText(iso)} AND l.type = ${sqlText(level)} AND l.external_code = v.external_code\n` +
      `              ELSE l.geonames_id = v.geonames_id\n` +
      `         END\n`
    : `  SELECT 1 FROM public.locations l WHERE l.geonames_id = v.geonames_id\n`;

  return (
    `INSERT INTO public.locations (geonames_id, name, name_i18n, type, parent_id, country_code, external_code)\n` +
    `SELECT v.geonames_id, v.name, v.name_i18n, ${sqlText(level)}, p.id, ${sqlText(iso)}, v.external_code\n` +
    `FROM (VALUES\n${values}\n` +
    `) AS v(geonames_id, name, name_i18n, external_code, parent_geonames_id, parent_type, parent_external_code)\n` +
    `JOIN public.locations p\n` +
    `  ON p.country_code = ${sqlText(iso)}\n` +
    ` AND p.type = v.parent_type::public.location_type\n` +
    parentMatch +
    `WHERE NOT EXISTS (\n${guard});\n`
  );
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
