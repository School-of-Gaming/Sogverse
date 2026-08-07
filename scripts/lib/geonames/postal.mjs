/**
 * Turning a country's postal source into `(postal code, municipality code)`
 * pairs — and refusing to hand them over if the coverage gate fails.
 *
 * ## Why this is a second ingestion rather than part of the first
 *
 * Postal codes are not geography. They are an alternative *key* onto a
 * municipality row that already exists, they change on their own schedule, and
 * **nothing references a postal row** — no product, no gedu claim, no family
 * pick. That last fact is the whole reason this is a separate ingestion with a
 * separate table: a postal refresh is a plain delete-and-reinsert, where a
 * geography refresh may never delete at all (`gedu_locations.location_id`
 * cascades). The two are on different discipline for a structural reason, so
 * they are on different code paths.
 *
 * ## The join, and the country it rules out
 *
 * Every emitted row lands by joining `(country_code, type = 'municipality',
 * external_code)`. `external_code` is the official statistical code, so a
 * country whose config maps none below the country row — the United Kingdom,
 * whose GeoNames admin codes are GeoNames' own invention — has no key to join
 * on and is refused here by name rather than silently producing an empty seed.
 * Giving it postal data means giving it a key first.
 *
 * ## Two sources, one shape
 *
 * - **`geonames`** (the default) reads `/export/zip/<CC>.zip` for each file in
 *   the country's set. The municipality code moves between admin columns from
 *   file to file — mainland Finland's kunta code is in `adminCode3`, Åland's is
 *   in `adminCode2`, in a *separate file for the same country* — so the column
 *   is declared per file in config, exactly as the dumps' level mappings are.
 * - **`laposte`** reads La Poste's Base officielle des codes postaux (Licence
 *   Ouverte 2.0), which keys on `code_commune_insee`. France needs it because
 *   GeoNames' French postal file carries the département+arrondissement code
 *   (751, 772…) rather than the commune INSEE code and joins **0 of ~34,900**
 *   communes — a structural mismatch, not a data-quality one, so no amount of
 *   upstream healing fixes it. The override is a data-source choice, not a
 *   legacy remnant.
 *
 * ## The rollup, and why it is config data
 *
 * La Poste keys Paris, Lyon and Marseille by *arrondissement* (75101–75120,
 * 69381–69389, 13201–13216) where the COG has one commune each (75056, 69123,
 * 13055). That is a fixed 45-code mapping which has not moved since the
 * arrondissements were created and is not derivable from either file, so it is
 * enumerated in the config rather than computed here. A rollup entry rewrites
 * the municipality code before the join; nothing else in this module knows the
 * three cities exist.
 *
 * ## The gates
 *
 * - **Coverage** — the fraction of the country's municipalities that got at
 *   least one code, against the config's `minCoverage`. Scoped to rows with a
 *   `geonames_id`, because the DB test fixtures in `supabase/seed.sql` include a
 *   small code-less Finnish tree that is nobody's postal problem.
 * - **Unmatched upstream codes are counted and reported, never failed on.** A
 *   postal file naming a municipality we do not carry is upstream lag, not a
 *   broken run: Finland's file still routes mail through two kuntaa abolished in
 *   2020 and 2021, and La Poste keys four communes nouvelles by the COG code
 *   GeoNames has not caught up to. Both heal on somebody else's schedule, and
 *   failing on them would make postal ingestion hostage to the geography's lag.
 */
import { downloadExternal, fail, readPostalDump } from "./cache.mjs";
import { parsePostalDump } from "./dump.mjs";

/**
 * A minimal RFC 4180 reader, for La Poste's quoted CSV.
 *
 * Written rather than depended on because the file has exactly one thing a
 * `split(",")` gets wrong — a `_geopoint` column holding "lat,lon" *inside* its
 * quotes — and a dependency for one archive format read once is the trade the
 * zip reader in `cache.mjs` already refused. It handles quotes, doubled quotes
 * and embedded separators, and nothing else, because nothing else is in the
 * file.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);

  return rows;
}

/** The CSV as objects keyed by its own header row. */
function parseCsvRecords(text, describedAs) {
  const rows = parseCsv(text);
  if (rows.length === 0) fail(`${describedAs}: no rows at all`);
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const record = {};
    for (let i = 0; i < header.length; i++) record[header[i]] = cells[i] ?? "";
    return record;
  });
}

/* ------------------------------------------------------------------ sources */

/** GeoNames postal files, one per ISO file the country's postal config names. */
async function readGeonamesPairs(config) {
  const declared = Object.entries(config.postal.files);
  if (declared.length === 0) {
    fail(
      `${config.iso}: postal source is "geonames" but the config names no files. ` +
        `Declare postal.files as { <ISO>: { muniCodeField: "adminCode<N>" } } for each ` +
        `member of isoFiles — the column holding the municipality code moves between ` +
        `files even within one country, so it cannot be guessed.`,
    );
  }

  const pairs = [];
  const files = [];
  for (const [iso, file] of declared) {
    const { text, lastModified } = await readPostalDump(iso);
    const rows = parsePostalDump(text);
    files.push({ iso, source: `download.geonames.org/export/zip/${iso}.zip`, published: lastModified, rows: rows.length });
    for (const row of rows) {
      const code = row[file.muniCodeField];
      if (row.postalCode === "" || code === "") continue;
      pairs.push({ postalCode: row.postalCode, municipalityCode: code, placeName: row.placeName });
    }
  }
  return { pairs, files };
}

/** La Poste's Base officielle des codes postaux, keyed on `code_commune_insee`. */
async function readLaPostePairs(config) {
  const { url } = config.postal;
  const { bytes, lastModified } = await downloadExternal(url, `laposte_${config.iso}_hexasmal.csv`);
  const records = parseCsvRecords(bytes.toString("utf8"), url);

  for (const column of ["code_commune_insee", "code_postal"]) {
    if (records[0][column] === undefined) {
      fail(
        `${config.iso}: ${url} has no "${column}" column — La Poste reshaped the export. ` +
          `Columns seen: ${Object.keys(records[0]).join(", ")}`,
      );
    }
  }

  const pairs = [];
  let rolledUp = 0;
  for (const record of records) {
    const postalCode = record.code_postal.trim();
    const insee = record.code_commune_insee.trim();
    if (postalCode === "" || insee === "") continue;
    const rolled = config.postal.rollup[insee];
    if (rolled !== undefined) rolledUp += 1;
    pairs.push({
      postalCode,
      municipalityCode: rolled ?? insee,
      placeName: record.nom_de_la_commune ?? "",
    });
  }

  return {
    pairs,
    rolledUp,
    files: [{ iso: config.iso, source: url, published: lastModified, rows: records.length }],
  };
}

/* ---------------------------------------------------------------- ingestion */

/**
 * Build and gate one country's postal rows.
 *
 * Takes the *ingested* geography rather than reading the database, for the same
 * reason the seed generator does: the emitted migration has to describe the tree
 * its sibling migrations produce, and the only offline statement of that tree is
 * the ingestion both run.
 *
 * @returns `{ rows, unmatched, uncovered, coverage, files, stats }` — `rows`
 * sorted by `(municipality code, postal code)` so a rerun emits the same bytes.
 */
export async function ingestPostal(config, ingested) {
  if (config.postal === null) {
    fail(`${config.iso}: the config entry declares no \`postal\` block, so there is no source to read.`);
  }

  const municipalities = (ingested.levels.find((level) => level.level === "municipality")?.rows ?? [])
    // Scoped to sourced rows. A config-declared synthetic municipality would
    // have no upstream record and so no postal coverage anyone could supply,
    // and the DB fixtures' code-less Finnish tree must not be counted either.
    .filter((row) => row.geonameid !== null);

  if (municipalities.length === 0) {
    fail(`${config.iso}: the geography ingestion produced no sourced municipalities to attach codes to`);
  }
  const codeless = municipalities.filter((row) => row.externalCode === null);
  if (codeless.length > 0) {
    fail(
      `${config.iso}: ${codeless.length} of ${municipalities.length} municipalities carry no external_code, ` +
        `so the postal join (country_code, type, external_code) has no key. A country whose config maps no ` +
        `official code is out of postal scope until it has one — see the UK note in config.mjs.`,
    );
  }

  const { pairs, files, rolledUp = 0 } =
    config.postal.source === "laposte" ? await readLaPostePairs(config) : await readGeonamesPairs(config);

  /* ------------------------------------------------------------ the join */

  const byCode = new Map(municipalities.map((row) => [row.externalCode, row]));
  const seen = new Set();
  const rows = [];
  const unmatchedByCode = new Map();
  const coveredCodes = new Set();

  for (const pair of pairs) {
    if (!byCode.has(pair.municipalityCode)) {
      const bucket = unmatchedByCode.get(pair.municipalityCode);
      if (bucket) bucket.postalCodes.add(pair.postalCode);
      else {
        unmatchedByCode.set(pair.municipalityCode, {
          municipalityCode: pair.municipalityCode,
          placeName: pair.placeName,
          postalCodes: new Set([pair.postalCode]),
        });
      }
      continue;
    }
    coveredCodes.add(pair.municipalityCode);
    // A code can legitimately appear against one municipality several times —
    // La Poste files one row per delivery label, so a commune with two labels
    // repeats its code. The table's key is the fact, not the row.
    const key = `${pair.municipalityCode} ${pair.postalCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ postalCode: pair.postalCode, municipalityCode: pair.municipalityCode });
  }

  rows.sort(
    (a, b) =>
      (a.municipalityCode < b.municipalityCode ? -1 : a.municipalityCode > b.municipalityCode ? 1 : 0) ||
      (a.postalCode < b.postalCode ? -1 : a.postalCode > b.postalCode ? 1 : 0),
  );

  const uncovered = municipalities
    .filter((row) => !coveredCodes.has(row.externalCode))
    .map((row) => ({ externalCode: row.externalCode, name: row.name }))
    .sort((a, b) => (a.externalCode < b.externalCode ? -1 : 1));

  const unmatched = [...unmatchedByCode.values()]
    .map((entry) => ({
      municipalityCode: entry.municipalityCode,
      placeName: entry.placeName,
      postalCodes: [...entry.postalCodes].sort(),
    }))
    .sort((a, b) => (a.municipalityCode < b.municipalityCode ? -1 : 1));

  /* ------------------------------------------------------------- the gate */

  const coverage = coveredCodes.size / municipalities.length;
  if (coverage < config.postal.minCoverage) {
    const sample = uncovered.slice(0, 10).map((row) => `${row.externalCode} ${row.name}`).join("; ");
    fail(
      `${config.iso}: ${coveredCodes.size} of ${municipalities.length} municipalities have a postal code ` +
        `(${(coverage * 100).toFixed(3)}%), below the configured floor of ` +
        `${(config.postal.minCoverage * 100).toFixed(3)}%. Uncovered: ${sample}` +
        `${uncovered.length > 10 ? ` … and ${uncovered.length - 10} more` : ""}`,
    );
  }

  // Literal safety, on the same terms as the geography ingestion: a value
  // carrying a control character produces a migration that is valid SQL and not
  // the data we meant.
  for (const row of rows) {
    for (const [what, value] of [
      ["postal code", row.postalCode],
      [`municipality code for postal ${row.postalCode}`, row.municipalityCode],
    ]) {
      if (value.length === 0) fail(`${config.iso}: ${what} is empty`);
      for (const char of value) {
        const point = char.codePointAt(0);
        if (point < 0x20 || point === 0x7f) {
          fail(`${config.iso}: ${what} contains a control character: ${JSON.stringify(value)}`);
        }
      }
    }
  }

  return {
    rows,
    unmatched,
    uncovered,
    coverage,
    files,
    stats: {
      upstreamPairs: pairs.length,
      municipalities: municipalities.length,
      covered: coveredCodes.size,
      distinctCodes: new Set(rows.map((row) => row.postalCode)).size,
      rolledUp,
    },
  };
}
