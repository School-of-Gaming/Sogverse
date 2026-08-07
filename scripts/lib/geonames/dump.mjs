/**
 * Parsing the GeoNames tab-separated dumps.
 *
 * Every file here is plain TSV with no quoting mechanism at all — a tab
 * separates fields and a newline separates records, and a field can therefore
 * never contain either. That makes `split` the correct parser rather than a
 * shortcut, and it is why there is no CSV machinery in this module.
 *
 * ## The one filtering rule worth stating twice
 *
 * **Feature codes are matched exactly, and the `H` variants are never live.**
 * GeoNames keeps abolished divisions as `ADM1H`/`ADM3H` rows carrying the same
 * admin codes as their successors — Finland has nine `ADM3H` rows sharing a
 * code with a live `ADM3` — so a prefix match or a `startsWith` would ingest a
 * merged-away municipality on top of the one that replaced it. Exact equality
 * against the configured code is the whole defence, and dedupe keys on
 * geonameid because official codes are not unique across the live/historic
 * split.
 */

/** Column indices of the `geoname` table, per the dump's own readme. */
const GEONAME = {
  geonameid: 0,
  name: 1,
  asciiname: 2,
  featureClass: 6,
  featureCode: 7,
  countryCode: 8,
  admin1: 10,
  admin2: 11,
  admin3: 12,
  admin4: 13,
  modificationDate: 18,
};

/** The admin-code columns a config's `codeField` may name. */
export const CODE_FIELDS = ["admin1", "admin2", "admin3", "admin4"];

/**
 * Rows of one country dump, as `{ geonameid, name, featureClass, featureCode,
 * countryCode, admin1..admin4, modificationDate }`. Blank lines are skipped;
 * nothing else is filtered here, because *what* is live is the config's
 * decision and this module's job is only to hand over the columns.
 */
export function parseCountryDump(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    if (line === "" || line === "\r") continue;
    const cells = line.replace(/\r$/, "").split("\t");
    rows.push({
      geonameid: Number(cells[GEONAME.geonameid]),
      name: cells[GEONAME.name] ?? "",
      asciiname: cells[GEONAME.asciiname] ?? "",
      featureClass: cells[GEONAME.featureClass] ?? "",
      featureCode: cells[GEONAME.featureCode] ?? "",
      countryCode: cells[GEONAME.countryCode] ?? "",
      admin1: cells[GEONAME.admin1] ?? "",
      admin2: cells[GEONAME.admin2] ?? "",
      admin3: cells[GEONAME.admin3] ?? "",
      admin4: cells[GEONAME.admin4] ?? "",
      modificationDate: cells[GEONAME.modificationDate] ?? "",
    });
  }
  return rows;
}

/** Column indices of the `alternateNamesV2` table. */
const ALTERNATE = {
  alternateNameId: 0,
  geonameid: 1,
  isolanguage: 2,
  alternateName: 3,
  isPreferredName: 4,
  isShortName: 5,
  isColloquial: 6,
  isHistoric: 7,
};

/**
 * Alternate names indexed as `Map<geonameid, Map<language, entry[]>>`, keeping
 * only the languages asked for. The whole file is tens of megabytes of mostly
 * irrelevant languages (and link/postal pseudo-languages), and every consumer
 * knows its languages up front, so filtering on the way in keeps the index to
 * the size of the answer.
 */
export function parseAlternateNames(text, languages) {
  const wanted = new Set(languages);
  const byGeonameId = new Map();

  for (const line of text.split("\n")) {
    if (line === "" || line === "\r") continue;
    const cells = line.replace(/\r$/, "").split("\t");
    const language = cells[ALTERNATE.isolanguage] ?? "";
    if (!wanted.has(language)) continue;

    const geonameid = Number(cells[ALTERNATE.geonameid]);
    const entry = {
      alternateNameId: Number(cells[ALTERNATE.alternateNameId]),
      name: cells[ALTERNATE.alternateName] ?? "",
      preferred: cells[ALTERNATE.isPreferredName] === "1",
      short: cells[ALTERNATE.isShortName] === "1",
      colloquial: cells[ALTERNATE.isColloquial] === "1",
      historic: cells[ALTERNATE.isHistoric] === "1",
    };
    if (entry.name === "") continue;

    let byLanguage = byGeonameId.get(geonameid);
    if (!byLanguage) {
      byLanguage = new Map();
      byGeonameId.set(geonameid, byLanguage);
    }
    const bucket = byLanguage.get(language);
    if (bucket) bucket.push(entry);
    else byLanguage.set(language, [entry]);
  }

  return byGeonameId;
}

/**
 * Column indices of the `postalCode` table (`/export/zip/<CC>.zip`), per the
 * dump's own readme. A different file from the country dump with a different
 * layout, so it gets its own map rather than borrowing `GEONAME`'s.
 */
const POSTAL = {
  countryCode: 0,
  postalCode: 1,
  placeName: 2,
  adminName1: 3,
  adminCode1: 4,
  adminName2: 5,
  adminCode2: 6,
  adminName3: 7,
  adminCode3: 8,
};

/** The postal admin-code columns a config's `muniCodeField` may name. */
export const POSTAL_CODE_FIELDS = ["adminCode1", "adminCode2", "adminCode3"];

/**
 * Rows of one country's postal file as
 * `{ countryCode, postalCode, placeName, adminCode1..3 }`.
 *
 * Which of those admin columns holds the *municipality* code is a per-file fact
 * and therefore config's to declare, not this parser's to guess: mainland
 * Finland puts the kunta code in `adminCode3` and Åland — a separate file for
 * the same country — puts it in `adminCode2`. Handing over all three is what
 * keeps that decision in one place.
 */
export function parsePostalDump(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    if (line === "" || line === "\r") continue;
    const cells = line.replace(/\r$/, "").split("\t");
    rows.push({
      countryCode: cells[POSTAL.countryCode] ?? "",
      postalCode: cells[POSTAL.postalCode] ?? "",
      placeName: cells[POSTAL.placeName] ?? "",
      adminCode1: cells[POSTAL.adminCode1] ?? "",
      adminCode2: cells[POSTAL.adminCode2] ?? "",
      adminCode3: cells[POSTAL.adminCode3] ?? "",
    });
  }
  return rows;
}

/**
 * `countryInfo.txt` as `Map<ISO alpha-2, { name, geonameid }>`. The file leads
 * with a block of `#` comment lines documenting its own columns.
 */
export function parseCountryInfo(text) {
  const byIso = new Map();
  for (const line of text.split("\n")) {
    if (line === "" || line.startsWith("#")) continue;
    const cells = line.replace(/\r$/, "").split("\t");
    const iso = cells[0] ?? "";
    if (iso === "") continue;
    byIso.set(iso, { name: cells[4] ?? "", geonameid: Number(cells[16]) });
  }
  return byIso;
}
