/**
 * Turning a country's config plus its GeoNames dumps into the rows a seed
 * migration inserts — and refusing to hand them over if any gate fails.
 *
 * Every country goes through this one function. What differs between countries
 * is entirely in `config.mjs`; nothing here knows what a län or a kunta is.
 *
 * ## The gates, and why each exists
 *
 * A seed that lands wrong is a hole in the tree an admin browses and a gedu
 * claims coverage over — places that simply are not there, with nothing
 * pointing at the cause. So the run fails rather than emits:
 *
 * - **Exact per-level counts against `expected`**, whose numbers come from the
 *   national statistical agency and never from the files. This is the gate that
 *   catches a forgotten `isoFiles` member (an Åland-shaped hole) *and*
 *   GeoNames' abolished-but-still-live rows (a surplus, named in the error).
 *   `allowMissing` names the codes upstream is known to lack; a code on that
 *   list that has *reappeared* fails too, because upstream healing is good news
 *   that still gets taken deliberately.
 * - **Every `exclude` entry still claims a record.** Same rule as the
 *   allowances, applied to the other quarantine list: an entry matching nothing
 *   means GeoNames dropped the abolished row (or re-filed it somewhere the
 *   selectors no longer look), and a quarantine with nothing in it has to be
 *   deleted deliberately rather than left reading like a live decision.
 * - **Zero orphans** — every row below the country resolved a parent. A row
 *   whose parent key names nothing would otherwise be dropped by the
 *   migration's own JOIN and show up only as a count that happened to match.
 * - **Zero rows missing `geonames_id`**, except the synthetic rows config
 *   declares outright.
 * - **Zero code-less rows at levels the config maps a code for**, and codes
 *   unique within `(country, type)` — the key every reconciliation, postal join
 *   and cutover re-point runs on.
 * - **No control characters and no empty names**, on names, alternates and
 *   codes alike. A value carrying one produces a migration that is valid SQL
 *   but not the data we meant.
 */
import { fail, readAlternateNames, readCountryDump, readCountryInfo } from "./cache.mjs";
import { allowanceLabel } from "./config.mjs";
import { parseAlternateNames, parseCountryDump, parseCountryInfo } from "./dump.mjs";
import { supportedLocales } from "./locales.mjs";
import { resolveAlternate, resolveCanonicalName, resolveNameI18n } from "./names.mjs";

/**
 * A value carrying a control character, or no value at all, would produce a
 * migration that is valid SQL but not the data we meant. Scanned by code point
 * rather than by a regex character class, which would have to spell the control
 * characters out and so put real control bytes in this file.
 */
function assertLiteralSafe(what, value) {
  if (value.length === 0) fail(`${what} is empty`);
  for (const char of value) {
    const point = char.codePointAt(0);
    if (point < 0x20 || point === 0x7f) {
      fail(`${what} contains a control character: ${JSON.stringify(value)}`);
    }
  }
}

/**
 * Every `[level, selector]` pair a file declares, flattened.
 *
 * A level is normally one selector. It is several when our one level is
 * assembled from two of GeoNames' — the UK's local authorities are its `ADM2`
 * rows outside Greater London plus its `ADM3` rows inside it — and flattening
 * here is what keeps the ingestion loop from knowing that.
 */
function* fileSelectors(fileLevels) {
  for (const [level, selectors] of Object.entries(fileLevels)) {
    for (const selector of selectors) yield [level, selector];
  }
}

/**
 * Whether a record passes a selector's `where` predicates — every one of them,
 * or the selector does not claim the row. An empty predicate list claims
 * everything with the right feature code, which is the ordinary case.
 */
function matchesWhere(record, predicates) {
  for (const predicate of predicates) {
    const value = record[predicate.field];
    if (predicate.equals !== undefined && value !== predicate.equals) return false;
    if (predicate.notEquals !== undefined && value === predicate.notEquals) return false;
  }
  return true;
}

/** Every language the run needs alternates for, deduped. */
function languagesNeeded(config) {
  const languages = new Set(supportedLocales());
  languages.add(config.countryRow.nameLanguage);
  for (const locale of config.alternateLocales) languages.add(locale);
  if (config.nameResolution !== "dump") languages.add(config.nameResolution.language);
  return [...languages];
}

/**
 * Read the config's whole file set once: places, alternates, and the country
 * reference table. Returns the dumps keyed by file plus one merged alternates
 * index — merged because a pin reaches across files (Åland's country record is
 * a Finnish region) and nothing downstream should have to know which file a
 * geonameid came from to find its names.
 */
async function readFiles(config) {
  const languages = languagesNeeded(config);
  const dumps = new Map();
  const alternates = new Map();
  // Every record indexed by geonameid, across the whole file set. Built once
  // because pins reach across files by id and France would otherwise be a
  // 34,742 × 174,637 scan.
  const records = new Map();
  const files = [];

  for (const iso of config.isoFiles) {
    const dump = await readCountryDump(iso);
    const alt = await readAlternateNames(iso);
    const rows = parseCountryDump(dump.text);
    dumps.set(iso, rows);
    for (const row of rows) records.set(row.geonameid, row);
    for (const [geonameid, byLanguage] of parseAlternateNames(alt.text, languages)) {
      alternates.set(geonameid, byLanguage);
    }
    files.push({ iso, dumpDate: dump.lastModified, alternatesDate: alt.lastModified, cached: dump.cached && alt.cached });
  }

  const info = await readCountryInfo();
  return { dumps, alternates, records, files, countryInfo: parseCountryInfo(info.text) };
}

/**
 * Build and gate one country's rows.
 *
 * @returns `{ country, levels, files, stats }` — `levels` in `levelOrder`, each
 * row's parent already resolved, everything sorted by geonameid.
 */
export async function ingestCountry(config) {
  const { dumps, alternates, records, files, countryInfo } = await readFiles(config);

  /* ------------------------------------------------------------- country row */

  const reference = countryInfo.get(config.iso);
  if (!reference) fail(`${config.iso}: no countryInfo.txt entry`);
  if (reference.geonameid !== config.countryRow.geonameid) {
    fail(
      `${config.iso}: config says the country record is ${config.countryRow.geonameid}, ` +
        `countryInfo.txt says ${reference.geonameid}`,
    );
  }

  const countryRecord = records.get(config.countryRow.geonameid);
  if (!countryRecord) {
    fail(`${config.iso}: country record ${config.countryRow.geonameid} is in none of the dump files`);
  }
  const countryAlternates = alternates.get(config.countryRow.geonameid);
  const countryName =
    resolveAlternate(countryAlternates, config.countryRow.nameLanguage) ?? countryRecord.name;
  // Countries are the one level where every supported UI locale has real
  // payload, so they ingest all of them rather than the config's
  // `alternateLocales` (which governs the levels below).
  const countryI18n = resolveNameI18n(countryName, countryAlternates, supportedLocales());

  const country = {
    geonameid: config.countryRow.geonameid,
    type: "country",
    name: countryName,
    nameI18n: countryI18n,
    externalCode: null,
    parent: null,
  };

  /* ------------------------------------------------------------- level rows */

  // Keyed `<file>\u0000<level>\u0000<codeField>\u0000<key>` — the address a
  // child row's admin column resolves to. The separator is a control character
  // precisely because no code or file name can contain one (the literal-safety
  // gate below is what guarantees that of the codes).
  //
  // `codeField` is part of the address because a level can be assembled from two
  // selectors reading two different admin columns, whose key spaces are unrelated
  // and may collide — the UK's ADM2 authority codes and its ADM3 London-borough
  // codes are both two characters drawn from the same alphabet.
  const byFileKey = new Map();
  const rowsByLevel = new Map(config.levelOrder.map((level) => [level, []]));
  let excluded = 0;
  // Which `exclude` entries actually claimed a record. An entry that claims
  // none is upstream having healed, and is gated below on exactly the same
  // terms as a stale allowance: good news that still gets taken deliberately.
  const excludeHits = new Set();

  for (const [file, fileLevels] of Object.entries(config.levels)) {
    const dump = dumps.get(file);
    for (const [level, mapping] of fileSelectors(fileLevels)) {
      for (const record of dump) {
        // Exact feature-code equality. The H variants carry the same admin
        // codes as the live rows that replaced them; a prefix match would
        // ingest a merged-away place on top of its successor.
        if (record.featureCode !== mapping.fcode) continue;
        if (!matchesWhere(record, mapping.where)) continue;
        if (config.exclude.has(record.geonameid)) {
          excluded += 1;
          excludeHits.add(record.geonameid);
          continue;
        }

        const key = record[mapping.codeField];
        if (key === "") {
          fail(
            `${config.iso}: ${file} ${mapping.fcode} row ${record.geonameid} (${record.name}) has an ` +
              `empty ${mapping.codeField} — it can be neither addressed nor parented`,
          );
        }

        const byLanguage = alternates.get(record.geonameid);
        const name = resolveCanonicalName(record, byLanguage, config.nameResolution);
        const row = {
          geonameid: record.geonameid,
          type: level,
          name,
          nameI18n: resolveNameI18n(name, byLanguage, config.alternateLocales),
          externalCode: null,
          parent: null,
          file,
          key,
          mapping,
          dumpName: record.name,
          record,
        };
        rowsByLevel.get(level).push(row);
        byFileKey.set(`${file}\u0000${level}\u0000${mapping.codeField}\u0000${key}`, row);
      }
    }
  }

  /* -------------------------------------------------------------------- pins */

  // Both pin shapes are collected here, but only the *synthetic* ones — the
  // rows GeoNames has no record for at all — are what the emitted assertion
  // counts. An attached pin carries a real geonameid and is keyed like any
  // other sourced row; counting it as keyless would make the migration assert a
  // number the seed cannot produce.
  const pinnedRows = [];
  for (const pin of config.pins) {
    if (pin.geonameid !== null) {
      const record = records.get(pin.geonameid);
      if (!record) fail(`${config.iso}: pinned geonameid ${pin.geonameid} is in none of the dump files`);
      const byLanguage = alternates.get(pin.geonameid);
      const name = resolveCanonicalName(record, byLanguage, config.nameResolution);
      const row = {
        geonameid: pin.geonameid,
        type: pin.type,
        name,
        nameI18n: resolveNameI18n(name, byLanguage, config.alternateLocales),
        externalCode: pin.externalCode,
        parent: null,
        file: pin.file ?? record.countryCode,
        key: pin.externalCode,
        mapping: null,
        dumpName: record.name,
        pin,
      };
      rowsByLevel.get(pin.type).push(row);
      pinnedRows.push(row);
    } else {
      // A row GeoNames has no administrative record for at all. `geonames_id`
      // stays NULL — it is unique, so a synthetic row could not borrow another
      // record's id even if one looked close enough.
      const row = {
        geonameid: null,
        type: pin.type,
        name: pin.name,
        nameI18n: {},
        externalCode: pin.externalCode,
        parent: null,
        file: null,
        key: pin.externalCode,
        mapping: null,
        dumpName: pin.name,
        pin,
      };
      rowsByLevel.get(pin.type).push(row);
      pinnedRows.push(row);
    }
  }

  /* ------------------------------------------------- parentage, admin-column */

  for (const level of config.levelOrder) {
    for (const row of rowsByLevel.get(level)) {
      if (row.mapping === null) continue; // a pin; parented below, by code
      if (row.mapping.parent !== null) continue; // file-level pin; parented below
      // The nearest level above this one that the *same file* provides. A file
      // that provides nothing above puts its rows straight under the country.
      const above = config.levelOrder.slice(0, config.levelOrder.indexOf(level)).reverse();
      let parentLevel = null;
      for (const candidate of above) {
        if (config.levels[row.file]?.[candidate]) {
          parentLevel = candidate;
          break;
        }
      }
      if (parentLevel === null) {
        row.parent = country;
        continue;
      }

      // The parent level may itself be several selectors reading different
      // admin columns; each is tried in turn and the first that names a row
      // this run produced wins.
      let parent;
      const tried = [];
      for (const parentMapping of config.levels[row.file][parentLevel]) {
        const parentKey = row.record[parentMapping.codeField];
        tried.push(`${parentMapping.codeField}="${parentKey}"`);
        parent = byFileKey.get(`${row.file}\u0000${parentLevel}\u0000${parentMapping.codeField}\u0000${parentKey}`);
        if (parent) break;
      }
      if (!parent) {
        fail(
          `${config.iso}: ${row.type} ${row.geonameid} (${row.name}) names ${parentLevel} ` +
            `${tried.join(" / ")} in ${row.file}, which is not a row this run produced`,
        );
      }
      row.parent = parent;
    }
  }

  /* ------------------------------------------------------------ official codes */

  // The direct case first: the level's key *is* its official code.
  for (const level of config.levelOrder) {
    for (const row of rowsByLevel.get(level)) {
      if (row.mapping === null) continue;
      if (row.mapping.officialCode.from === "codeField") row.externalCode = row.key;
      else if (row.mapping.officialCode.from === "literal") row.externalCode = row.mapping.officialCode.literal;
      else if (row.mapping.officialCode.from === "none") row.externalCode = null;
    }
  }

  // Then the derived case: a level whose own admin code is GeoNames' private
  // numbering takes its official code from the prefix its municipalities share.
  for (const level of config.levelOrder) {
    const derived = rowsByLevel
      .get(level)
      .filter((row) => row.mapping?.officialCode.from === "municipalityPrefix");
    if (derived.length === 0) continue;

    const digits = derived[0].mapping.officialCode.digits;
    const prefixes = new Map(derived.map((row) => [row, new Set()]));
    for (const municipality of rowsByLevel.get("municipality") ?? []) {
      if (municipality.externalCode === null) continue;
      let ancestor = municipality.parent;
      while (ancestor && ancestor.type !== level) ancestor = ancestor.parent;
      const bucket = ancestor ? prefixes.get(ancestor) : undefined;
      if (bucket) bucket.add(municipality.externalCode.slice(0, digits));
    }

    for (const row of derived) {
      const found = [...prefixes.get(row)];
      if (found.length !== 1) {
        fail(
          `${config.iso}: ${level} ${row.geonameid} (${row.name}) should take its official code from ` +
            `the first ${digits} digits of its municipalities' codes, but they give ` +
            `${found.length === 0 ? "none" : found.join(", ")}`,
        );
      }
      row.externalCode = found[0];
    }
  }

  /* --------------------------------------------------- parentage, by code pin */

  const byExternalKey = new Map();
  for (const level of config.levelOrder) {
    for (const row of rowsByLevel.get(level)) {
      if (row.externalCode === null) continue;
      byExternalKey.set(`${level}\u0000${row.externalCode}`, row);
    }
  }

  function resolvePinnedParent(target, describedAs) {
    if (target.type === "country") return country;
    const parent = byExternalKey.get(`${target.type}\u0000${target.externalCode}`);
    if (!parent) {
      fail(
        `${config.iso}: ${describedAs} is pinned under ${target.type} "${target.externalCode}", ` +
          `which is not a row this run produced`,
      );
    }
    return parent;
  }

  for (const level of config.levelOrder) {
    for (const row of rowsByLevel.get(level)) {
      if (row.parent !== null) continue;
      if (row.mapping?.parent) {
        row.parent = resolvePinnedParent(row.mapping.parent, `${row.file} ${level} ${row.name}`);
      } else if (row.pin) {
        row.parent = row.pin.parent
          ? resolvePinnedParent(row.pin.parent, `pinned ${level} ${row.externalCode}`)
          : country;
      }
    }
  }

  /* ------------------------------------------------------------------- gates */

  const problems = [];

  // An `exclude` entry that claimed nothing is a quarantine with nothing left
  // in it: GeoNames dropped the abolished row, or re-filed it under a feature
  // code the selectors no longer claim. Left unchecked the entry stays in the
  // config forever, reading as a live decision about data that has moved on —
  // and the next reader has no way to tell it from one still doing work.
  for (const geonameid of config.exclude) {
    if (excludeHits.has(geonameid)) continue;
    problems.push(
      `exclude names geonameid ${geonameid} but no parsed record carries it — ` +
        `upstream healed, so shrink the exclude list in the config`,
    );
  }

  // Dedupe: geonameid is the identity, because official codes are not unique
  // across GeoNames' live/historic split and names are not unique at all.
  const seen = new Map();
  for (const level of config.levelOrder) {
    for (const row of rowsByLevel.get(level)) {
      if (row.geonameid === null) continue;
      const previous = seen.get(row.geonameid);
      if (previous) {
        problems.push(
          `geonameid ${row.geonameid} produced two rows: ${previous.type} "${previous.name}" and ` +
            `${row.type} "${row.name}"`,
        );
      }
      seen.set(row.geonameid, row);
    }
  }
  if (seen.has(config.countryRow.geonameid)) {
    problems.push(`the country record ${config.countryRow.geonameid} was also ingested as a level row`);
  }

  for (const level of config.levelOrder) {
    const rows = rowsByLevel.get(level);
    const { count, allowMissing, allowExtra } = config.expected[level];

    // An allowance is addressed by whatever key its level has: the official
    // code where the config maps one, and otherwise the row's geonameid (for
    // something upstream carries) or its resolved name (for something upstream
    // does not, which has no geonameid to point at).
    const present = {
      code: new Set(rows.map((row) => row.externalCode).filter((code) => code !== null)),
      geonameid: new Set(rows.map((row) => row.geonameid).filter((id) => id !== null)),
      name: new Set(rows.map((row) => row.name)),
    };
    const carried = (entry) => present[entry.by].has(entry.value);

    for (const entry of allowMissing) {
      if (carried(entry)) {
        problems.push(
          `${level}: ${allowanceLabel(entry)} is on allowMissing but GeoNames now carries it — ` +
            `upstream healed, so shrink allowMissing in the config`,
        );
      }
    }
    for (const entry of allowExtra) {
      if (!carried(entry)) {
        problems.push(
          `${level}: ${allowanceLabel(entry)} is on allowExtra but GeoNames no longer carries it — ` +
            `upstream healed, so shrink allowExtra (and probably allowMissing) in the config`,
        );
      }
    }

    const target = count - allowMissing.length + allowExtra.length;
    const allowanceNote = [
      allowMissing.length > 0 ? `minus ${allowMissing.length} named as missing` : null,
      allowExtra.length > 0 ? `plus ${allowExtra.length} named as extra` : null,
    ]
      .filter(Boolean)
      .join(", ");
    if (rows.length !== target) {
      const sample = rows
        .slice(0, 5)
        .map((row) => `${row.externalCode ?? "?"} ${row.name}`)
        .join("; ");
      problems.push(
        `${level}: produced ${rows.length} rows, expected ${target} ` +
          `(national count ${count}${allowanceNote === "" ? "" : ` ${allowanceNote}`}). ` +
          `Identify the surplus or shortfall against the national list, then fix the config, ` +
          `extend exclude, or fix GeoNames. First rows: ${sample}`,
      );
    }

    // Orphans, code-less rows, code uniqueness, literal safety.
    const codes = new Map();
    for (const row of rows) {
      if (row.parent === null) problems.push(`${level} "${row.name}" resolved no parent`);
      if (row.geonameid === null && !row.pin) {
        problems.push(`${level} "${row.name}" has no geonames_id and is not a declared synthetic row`);
      }
      const wantsCode = row.mapping === null || row.mapping.officialCode.from !== "none";
      if (wantsCode && row.externalCode === null) {
        problems.push(`${level} "${row.name}" carries no official code at a level the config maps codes for`);
      }
      if (row.externalCode !== null) {
        const previous = codes.get(row.externalCode);
        if (previous) problems.push(`${level}: code "${row.externalCode}" is on both "${previous}" and "${row.name}"`);
        codes.set(row.externalCode, row.name);
        assertLiteralSafe(`${level} code for "${row.name}"`, row.externalCode);
      }
      assertLiteralSafe(`${level} name (geonameid ${row.geonameid})`, row.name);
      for (const [locale, value] of Object.entries(row.nameI18n)) {
        assertLiteralSafe(`${level} "${row.name}" name_i18n.${locale}`, value);
      }
    }
  }

  assertLiteralSafe(`${config.iso} country name`, country.name);
  for (const [locale, value] of Object.entries(country.nameI18n)) {
    assertLiteralSafe(`${config.iso} country name_i18n.${locale}`, value);
  }

  if (problems.length > 0) {
    fail(`${config.iso}: ingestion gates failed\n\n  - ${problems.join("\n  - ")}`);
  }

  /* ------------------------------------------------------------------- order */

  // Sorted by geonameid, in numeric order, everywhere. It is the row identity,
  // it is stable across dumps, and sorting by it means nothing about the
  // emitted file depends on the order the dump happened to list rows in.
  // Synthetic rows have no geonameid and sort last, by their official code in
  // code-unit order.
  const levels = config.levelOrder.map((level) => ({
    level,
    rows: [...rowsByLevel.get(level)].sort((a, b) => {
      if (a.geonameid === null || b.geonameid === null) {
        if (a.geonameid !== null) return -1;
        if (b.geonameid !== null) return 1;
        return a.externalCode < b.externalCode ? -1 : a.externalCode > b.externalCode ? 1 : 0;
      }
      return a.geonameid - b.geonameid;
    }),
  }));

  return {
    country,
    levels,
    files,
    stats: {
      excluded,
      attached: pinnedRows.filter((row) => row.geonameid !== null).length,
      synthetic: pinnedRows.filter((row) => row.geonameid === null).length,
    },
    alternates,
  };
}

/**
 * A side-by-side of what each `nameResolution` would have produced, printed by
 * the generator so the per-country judgment stays a thing someone can re-check
 * in seconds rather than a decision buried in a config comment.
 */
export function nameResolutionCrossCheck(config, ingested) {
  const language = config.nameResolution === "dump" ? config.countryRow.nameLanguage : config.nameResolution.language;
  const report = [];
  for (const { level, rows } of ingested.levels) {
    let missing = 0;
    const differing = [];
    for (const row of rows) {
      const alternate = resolveAlternate(ingested.alternates.get(row.geonameid), language);
      if (alternate === null) missing += 1;
      else if (alternate !== row.dumpName) differing.push(`${row.dumpName} / ${alternate}`);
    }
    report.push({ level, total: rows.length, language, missing, differing });
  }
  return report;
}
