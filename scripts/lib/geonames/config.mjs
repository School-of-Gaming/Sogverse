/**
 * Per-country ingestion config — one entry per country, and the validator that
 * refuses a malformed one.
 *
 * GeoNames is the source and the authority for every country's geography, and
 * everything that differs between countries lives in this file. Adding a
 * country is: write an entry here, run `scripts/generate-geonames-seed.mjs
 * <CC>`, review the migration, push it. There is deliberately no country-
 * specific executable code anywhere — every shape the dumps come in is
 * absorbed by a field below.
 *
 * ## The fields, and the verified failure each one answers
 *
 * - **`isoFiles`** — a country maps to a *set* of ISO-3166 alpha-2 dump files,
 *   not one. Finland is `{FI, AX}` and France is `{FR, GP, MQ, GF, RE, YT}`,
 *   and a forgotten member is a silent hole in the tree: a gedu who ticks
 *   "France" would simply not cover Mayotte. What catches it is `expected`
 *   below, never the files themselves.
 *
 * - **`levelOrder`** — the country's levels from the top down, which is what
 *   makes "the level above this one" a question with an answer. Stated here
 *   rather than read from the UI hierarchy config in
 *   `src/lib/constants/location-hierarchies.ts`, which stays the authority on
 *   what each level is *called*: that file is TypeScript behind a path alias
 *   and cannot be imported from a `.mjs` script. The two must agree, and the
 *   gates will not tell you if they do not — check it when writing an entry.
 *
 * - **`levels`** — per *file*, which feature code is which level of our
 *   hierarchy and which admin-code column carries that level's key. Per-file
 *   because the same country's files disagree: Åland's kuntaa are `ADM2` rows
 *   with the code in `admin2` where mainland Finland's are `ADM3` with the code
 *   in `admin3`, and Mayotte's communes are `ADM1` rows carrying the full INSEE
 *   code in `admin1` with no `ADM2`/`ADM3`/`ADM4` at all. `codeField` defaults
 *   to the admin column matching the feature code (`ADM2` → `admin2`), which is
 *   the common case; state it explicitly wherever the file disagrees.
 *
 *   A level's `parent` pins the whole file's subtree under a row named by
 *   `(type, externalCode)` — that is how AX's municipalities land under maakunta
 *   21 and YT's communes under département 976, neither of which their own file
 *   models. Without a `parent`, a level is parented to the nearest level above
 *   it in `levelOrder` that the same file provides, matched on that level's
 *   `codeField` column, and a level with nothing above it in its file goes under
 *   the country row.
 *
 * - **`officialCode`** — what lands in `external_code`, which keeps its
 *   existing contract (the row's code in its country's official statistical
 *   classification, unique per country+type) and never holds a geonameid. By
 *   default it is the `codeField` value, because the municipality level
 *   reliably carries the official national code in an admin column for every
 *   country verified. The upper levels only sometimes do: Sweden's `admin1` is
 *   GeoNames' own numbering, not SCB's, so its regions declare
 *   `{ fromMunicipalityPrefix: 2 }` — the official län code is the first two
 *   digits of its kommuner's four-digit SCB codes. `{ literal: "01" }` states
 *   the code outright, for a file whose whole level is one row GeoNames keys by
 *   something that is not a code at all: each French DROM file carries its
 *   région as a single `ADM1` whose `admin1` is the territory's ISO letters
 *   ("GP"), where the COG says "01". `officialCode: null` says the level has no
 *   official code at all, and its rows carry NULL.
 *
 *   The `codeField` stays the level's *key* in every case — it is what a child
 *   row's own admin column names to find its parent — so overriding the
 *   official code never disturbs parentage.
 *
 * - **`nameResolution`** — the one per-country judgment about names, made once
 *   when the entry is written and checked by generating and eyeballing the
 *   result. `"dump"` takes the dump's `name` column; `{ language: "xx" }`
 *   resolves through that language's alternates. Neither is universally right:
 *   Finland's dump names are Swedish for 17 municipalities, and France's French
 *   alternates are polluted with pre-merger names and a preferred-flagged
 *   "Département de Paris". The generator prints a comparison of both so the
 *   choice can be re-checked in seconds.
 *
 * - **`alternateLocales`** — the locales below country level that ingest a
 *   `name_i18n` entry, resolved by the same mechanical rule and skipped where
 *   the value equals the canonical name. Empirically per country/locale pair:
 *   Finland's `sv` carries real payload because a co-official language got the
 *   administrative records annotated, while France's `fi` is 13 mistagged
 *   variants. Leave it empty until an ingest diff shows the locale is worth
 *   having. Country rows are not governed by this and always take every
 *   supported UI locale.
 *
 * - **`countryRow`** — the country's own GeoNames record, from
 *   `countryInfo.txt`, plus `nameLanguage`: the language whose alternate is the
 *   canonical name. The dump's own `name` for a country record is its long
 *   English form ("Kingdom of Sweden", "Republic of Finland"), which is nobody's
 *   canonical native name, so this is asked for explicitly rather than derived
 *   from `nameResolution`.
 *
 * - **`pins`** — declarative fixes for subtrees GeoNames does not model. Two
 *   shapes: *attach* (`geonameid` given) sources a row from a record the level
 *   filters would not have picked up — Åland's country record PCLD *is* our
 *   maakunta 21 — and *synthetic* (`name` given) declares a row outright with
 *   `geonames_id` NULL, for Mayotte's région and département, which exist in no
 *   GeoNames file as administrative rows.
 *
 * - **`exclude`** — the reviewed escape hatch for upstream rows that are simply
 *   wrong: geonameids of places GeoNames still carries live after they were
 *   abolished. Expected to be tiny, every entry a recorded human decision, and
 *   the durable fix is correcting GeoNames so the entry can be dropped.
 *
 * - **`expected`** — per level, the count **from the national statistical
 *   agency, never derived from the files being read**, plus two named
 *   allowances for the places where upstream and the national list disagree.
 *   This is the single most load-bearing gate in the system: it is what turns a
 *   forgotten `isoFiles` member into a failed run instead of a hole, and what
 *   surfaces an abolished-but-still-live row as a surplus.
 *
 *   `allowMissing` names official codes GeoNames does not carry; `allowExtra`
 *   names codes GeoNames carries that the national classification does not.
 *   Both are needed because upstream lag comes in two shapes, and France has
 *   both at once: four communes GeoNames has simply never heard of, and four it
 *   files under the pre-merger chef-lieu's code — *present, under the wrong
 *   key*. A missing-only allowance would score the second kind twice, once as a
 *   shortfall and once as a surplus, and no honest count could then be written
 *   down. The target is therefore `count - allowMissing + allowExtra`.
 *
 *   Both lists are checked in both directions: the gate fails on an
 *   `allowMissing` code that *shows up* and on an `allowExtra` code that has
 *   *gone*, because upstream healing is good news that still gets taken
 *   deliberately, by shrinking the list here.
 *
 * - **`postal`** — where postal codes come from and, per file, which admin
 *   column of the postal dump carries the municipality code (it moves: Finland's
 *   is column `adminCode3`, Åland's `adminCode2`). Declared here, consumed by
 *   the postal generator; France is the one country that will override the
 *   source, because GeoNames' French postal file carries arrondissement codes
 *   and joins zero communes.
 */
import { fail } from "./cache.mjs";
import { CODE_FIELDS } from "./dump.mjs";

/**
 * The levels this system seeds, from the top down. `site` is absent on purpose:
 * sites are created by admins, never seeded, and nothing above `site` is ever
 * inserted by the application.
 *
 * A country's own `levelOrder` is a subset of this in this order — Finland
 * skips `district`, France uses it between region and municipality. The UI
 * hierarchy config in `src/lib/constants/location-hierarchies.ts` stays the
 * authority on what each level is *called*; this is only about which row is
 * whose parent. (The speculative US/GB/JP entries there put `district` *below*
 * municipality; none is seeded, and the day one is, this constant is part of
 * what has to generalize.)
 */
export const SEEDED_LEVELS = ["region", "district", "municipality"];

/* ------------------------------------------------------------------ entries */

/**
 * @type {Record<string, object>}
 *
 * Sweden is the pilot. Its shape is the clean case and worth reading as the
 * template: one file, two levels, no pins, no exclusions.
 */
export const COUNTRIES = {
  SE: {
    isoFiles: ["SE"],
    levelOrder: ["region", "municipality"],
    // Verified 2026-08-07 against the live dump: the dump's `name` for a län is
    // the anglicized "Norrbotten County" and for a kommun the Swedish "Umeå
    // Kommun". The `sv` alternates give "Norrbottens län" for all 21 regions
    // but exist for only 41 of the 290 kommuner, and disagree with the dump
    // name on 14 of those (Haparanda Kommun → "Haparanda Stad"). Neither option
    // is clean at the kommun level; the decision-owner's call (2026-08-07) is
    // the same rule Finland's verification forced: canonical names are the
    // country's own language, so the anglicized län are the defect that matters
    // and the residual kommun spelling drift is GeoNames data quality, fixable
    // upstream. The generator prints both readings so this stays re-checkable.
    nameResolution: { language: "sv" },
    // Nothing below country level yet: `sv` is the canonical language of these
    // rows, so it would be the never-duplicate rule's own violation, and no
    // other locale has payload worth ingesting.
    alternateLocales: [],
    levels: {
      SE: {
        // GeoNames' admin1 is its own numbering (Norrbotten is `14` here and
        // `25` officially), so the län's official code is derived from its
        // kommuner instead. The admin1 value is still this level's key —
        // it is what the ADM2 rows carry to name their parent.
        region: { fcode: "ADM1", codeField: "admin1", officialCode: { fromMunicipalityPrefix: 2 } },
        // admin2 is the official four-digit SCB kommun code (Umeå 2480).
        municipality: { fcode: "ADM2", codeField: "admin2" },
      },
    },
    countryRow: { geonameid: 2661886, nameLanguage: "sv" },
    pins: [],
    exclude: [],
    // SCB (Statistiska centralbyrån): 21 län, 290 kommuner.
    expected: { region: 21, municipality: 290 },
    postal: { source: "geonames" },
  },

  FI: {
    // Åland is country AX in GeoNames and maakunta 21 to Statistics Finland.
    // Forgetting the second file is the Åland-shaped hole `expected` exists to
    // catch: 16 kuntaa, and a gedu's "Finland" tick silently not covering them.
    isoFiles: ["FI", "AX"],
    levelOrder: ["region", "municipality"],
    // Verified 2026-08-07 against the live dump: the dump's `name` column is not
    // Finnish. 17 municipalities carry the Swedish form (Pargas, Korsholm,
    // Jakobstad, Raseborg…) and several maakunnat are anglicized ("Central
    // Finland", "Lapland"). Resolving through the `fi` alternates reproduces
    // every one of the 19 + 308 + 1 names this tree already had, byte for byte
    // — which is what makes the cutover invisible in Finland.
    nameResolution: { language: "fi" },
    // Verified 2026-08-07: mechanical `sv` resolution agrees with 50 of the 51
    // curated legal Swedish names, loses none, and adds 83 established
    // Finland-Swedish exonyms (Tammerfors, Nystad, Torneå). The one
    // disagreement is Kanta-Häme, which resolves to "Tavastland" where the legal
    // name is "Egentliga Tavastland" — fixed upstream in GeoNames if it matters,
    // never with a local override.
    alternateLocales: ["sv"],
    levels: {
      FI: {
        // admin1 is the official maakunta code (01–19).
        region: { fcode: "ADM1", codeField: "admin1" },
        // admin3 is the official kunta code. Every ADM3 row carries admin1 too,
        // so the parent chain comes off the row itself.
        municipality: { fcode: "ADM3", codeField: "admin3" },
      },
      AX: {
        // The column shift: Åland's kuntaa are ADM2 rows with the kunta code in
        // admin2. AX's own ADM1 level is the three Åland sub-regions, which are
        // not a level we model, so the whole file is pinned under maakunta 21.
        municipality: {
          fcode: "ADM2",
          codeField: "admin2",
          parent: { type: "region", externalCode: "21" },
        },
      },
    },
    countryRow: { geonameid: 660013, nameLanguage: "fi" },
    // GeoNames has no maakunta row for Åland at all: its PCLD country record
    // *is* our maakunta 21, so the pin attaches that record rather than
    // declaring a synthetic row.
    pins: [{ type: "region", externalCode: "21", geonameid: 661882 }],
    // Two municipalities GeoNames still carries as live ADM3 years after they
    // were abolished: 099 Honkajoki (merged into Kankaanpää in 2021, upstream
    // last touched 2022) and 911 Valtimo (merged into Nurmes in 2020, upstream
    // last touched 2016). Both are recorded human decisions, and the durable fix
    // is correcting GeoNames so these entries can be dropped. A third stale code
    // the investigation listed — 588 Pertunmaa — GeoNames has since moved to
    // ADM3H itself, which is why it is not here.
    exclude: [657480, 632553],
    // Statistics Finland, 2026 classifications: 19 maakuntaa, 308 kuntaa.
    expected: { region: 19, municipality: 308 },
    postal: {
      source: "geonames",
      // The same file-set trap as the dumps, one column over: Åland's postal
      // file carries the kunta code in admin code 2 where mainland Finland's
      // carries it in admin code 3.
      files: { FI: { muniCodeField: "adminCode3" }, AX: { muniCodeField: "adminCode2" } },
    },
  },

  FR: {
    // The five DROM are their own GeoNames countries. Mayotte is the one that
    // breaks every assumption at once — see the YT mapping and the pins below.
    isoFiles: ["FR", "GP", "MQ", "GF", "RE", "YT"],
    levelOrder: ["region", "district", "municipality"],
    // Verified 2026-08-07: France is the country where the dump name is the
    // honest one and the alternates are not. Resolving through `fr` the way
    // Finland resolves through `fi` renames a preferred-flagged "Département de
    // Paris" over "Paris", picks "Région PACA" as the shortest candidate for
    // Provence-Alpes-Côte d'Azur, collapses Bourgogne-Franche-Comté to
    // "Bourgogne" and Auvergne-Rhône-Alpes to "Rhône-Alpes", and carries
    // pre-merger names on dozens of renamed communes — 92 diffs in all.
    //
    // The dump name is not free either, and the cost is named rather than
    // hidden: 15 communes and 10 départements differ from the COG names this
    // tree had, the départements visibly so ("Upper Garonne" for Haute-Garonne,
    // "South Corsica" for Corse-du-Sud, "Cote d'Or" with the accent lost,
    // "Département du Nord" for Nord). Under one authority those are simply the
    // names France ships with, and each is correctable *in GeoNames*. Swapping
    // to `fr` would trade 10 wrong départements for 3 wrong régions and 92
    // wrong rows overall, which is the worse half of the trade.
    nameResolution: "dump",
    // Verified 2026-08-07 and deliberately empty: France is the failing case for
    // alternate payload. Only 13 of ~34,850 admin rows carry a `fi` alternate
    // differing from the canonical name, none of them a name a Finnish speaker
    // would recognize (no "Pariisi") — mostly mistagged orthographic variants
    // and one outright wrong ("Chasselas"→"Gutedel", a German grape). English
    // fares no better as display ("Département du Nord"→"North"). The famous
    // exonyms live on GeoNames' populated-place records, which are different
    // records with different geonameids from the administrative rows this tree
    // ingests. A locale goes in here when its ingest diff shows real payload,
    // and not before.
    alternateLocales: [],
    levels: {
      FR: {
        // Metropolitan France: admin1/admin2/admin4 are the official INSEE
        // région, département and commune codes. ADM3 is the arrondissement, a
        // rung we deliberately do not model.
        region: { fcode: "ADM1", codeField: "admin1" },
        district: { fcode: "ADM2", codeField: "admin2" },
        municipality: { fcode: "ADM4", codeField: "admin4" },
      },
      // The four DROM that GeoNames models fully. Each file's single ADM1 keys
      // itself by the territory's ISO letters ("GP") rather than by the COG's
      // région code, so the official code is stated outright; ADM2 and ADM4
      // carry the real 971–974 and five-digit codes.
      GP: {
        region: { fcode: "ADM1", codeField: "admin1", officialCode: { literal: "01" } },
        district: { fcode: "ADM2", codeField: "admin2" },
        municipality: { fcode: "ADM4", codeField: "admin4" },
      },
      MQ: {
        region: { fcode: "ADM1", codeField: "admin1", officialCode: { literal: "02" } },
        district: { fcode: "ADM2", codeField: "admin2" },
        municipality: { fcode: "ADM4", codeField: "admin4" },
      },
      GF: {
        region: { fcode: "ADM1", codeField: "admin1", officialCode: { literal: "03" } },
        district: { fcode: "ADM2", codeField: "admin2" },
        municipality: { fcode: "ADM4", codeField: "admin4" },
      },
      RE: {
        region: { fcode: "ADM1", codeField: "admin1", officialCode: { literal: "04" } },
        district: { fcode: "ADM2", codeField: "admin2" },
        municipality: { fcode: "ADM4", codeField: "admin4" },
      },
      YT: {
        // Mayotte has no ADM2, ADM3 or ADM4 at all: its 17 communes are ADM1
        // rows carrying the full five-digit INSEE code in admin1. Nothing in
        // the file stands for the région or the département, so the subtree is
        // pinned under the synthetic département below.
        municipality: {
          fcode: "ADM1",
          codeField: "admin1",
          parent: { type: "district", externalCode: "976" },
        },
      },
    },
    countryRow: { geonameid: 3017382, nameLanguage: "fr" },
    // Mayotte's région 06 and département 976 exist in no GeoNames file as
    // administrative rows, so they are declared outright with `geonames_id`
    // NULL. They could not borrow YT's country record between them in any case
    // — `geonames_id` is unique. France's expected 18 régions and 101
    // départements include these two.
    pins: [
      { type: "region", externalCode: "06", name: "Mayotte" },
      {
        type: "district",
        externalCode: "976",
        name: "Mayotte",
        parent: { type: "region", externalCode: "06" },
      },
    ],
    exclude: [],
    expected: {
      // INSEE Code officiel géographique 2026: 18 régions, 101 départements,
      // 34,875 communes.
      region: 18,
      district: 101,
      municipality: {
        count: 34875,
        // Four communes restored by the 2026 COG when a commune nouvelle was
        // dissolved (all in Cantal), which GeoNames does not carry at all yet.
        // They arrive through sync when upstream adds them.
        allowMissing: [
          "15031", // Celles
          "15035", // Chalinargues
          "15047", // Chavagnac
          "15171", // Sainte-Anastasie
          // Four communes nouvelles GeoNames *does* carry, under the wrong code
          // — see allowExtra for the code it files each of them under.
          "12218", // Conques-en-Rouergue
          "14581", // Aurseulles
          "49126", // Orée d'Anjou
          "69114", // Porte des Pierres Dorées
        ],
        // The other half of those four. GeoNames still keys each commune
        // nouvelle by its pre-merger chef-lieu's INSEE code, so the row is
        // present under a code the COG retired. Named here so the count is
        // honest in both directions rather than a shortfall and a surplus
        // cancelling out. The consequence is real and small: an official-data
        // join (La Poste postal, above all) misses these four until upstream
        // corrects the code.
        allowExtra: [
          "12076", // Conques-en-Rouergue, filed under Conques
          "14011", // Aurseulles, filed under Anctoville
          "49069", // Orée d'Anjou, filed under Champtoceaux
          "69159", // Porte des Pierres Dorées, filed under Le Breuil
        ],
      },
    },
    // GeoNames' French postal file carries the département+arrondissement code
    // in admin code 3, not the commune INSEE code, so it joins 0 of 34,875
    // communes. France is the one country whose postal source is overridden —
    // La Poste's Base officielle des codes postaux, which joins on
    // `code_commune_insee`. Declared here, consumed by the postal generator.
    postal: { source: "laposte" },
  },
};

/* --------------------------------------------------------------- validation */

/** Normalize `expected` to the `{ count, allowMissing, allowExtra }` shape. */
function normalizeExpected(value, where) {
  if (typeof value === "number") return { count: value, allowMissing: [], allowExtra: [] };
  if (value && typeof value === "object" && typeof value.count === "number") {
    const normalized = {
      count: value.count,
      allowMissing: value.allowMissing ?? [],
      allowExtra: value.allowExtra ?? [],
    };
    for (const list of ["allowMissing", "allowExtra"]) {
      if (!Array.isArray(normalized[list]) || normalized[list].some((code) => typeof code !== "string")) {
        fail(`${where}: ${list} must be an array of official codes`);
      }
    }
    // A code on both lists says upstream both lacks it and carries it. That is
    // never a fact about the data; it is a fact about someone editing one list
    // and forgetting the other.
    const both = normalized.allowMissing.filter((code) => normalized.allowExtra.includes(code));
    if (both.length > 0) {
      fail(`${where}: ${both.join(", ")} appear on both allowMissing and allowExtra`);
    }
    return normalized;
  }
  fail(`${where}: expected must be a count or { count, allowMissing, allowExtra }`);
}

/**
 * Read one country's config, normalized and validated. Everything a generator
 * assumes about the shape is checked here, once, so no downstream module has to
 * re-ask whether a field is present.
 */
export function countryConfig(iso) {
  const raw = COUNTRIES[iso];
  if (!raw) {
    fail(
      `No GeoNames config entry for "${iso}". Known countries: ` +
        `${Object.keys(COUNTRIES).join(", ")}. Adding one is a config entry in ` +
        `scripts/lib/geonames/config.mjs, not code.`,
    );
  }

  const where = `config ${iso}`;

  if (!Array.isArray(raw.isoFiles) || raw.isoFiles.length === 0) {
    fail(`${where}: isoFiles must be a non-empty array of ISO alpha-2 file names`);
  }
  if (!Array.isArray(raw.levelOrder) || raw.levelOrder.length === 0) {
    fail(`${where}: levelOrder must be a non-empty array`);
  }
  for (const level of raw.levelOrder) {
    if (!SEEDED_LEVELS.includes(level)) {
      fail(`${where}: levelOrder names "${level}", which is not one of ${SEEDED_LEVELS.join(", ")}`);
    }
  }

  const nameResolution = raw.nameResolution;
  const resolutionOk =
    nameResolution === "dump" ||
    (nameResolution && typeof nameResolution === "object" && typeof nameResolution.language === "string");
  if (!resolutionOk) {
    fail(`${where}: nameResolution must be "dump" or { language: "xx" }`);
  }

  if (!Array.isArray(raw.alternateLocales)) {
    fail(`${where}: alternateLocales must be an array (empty is the normal answer)`);
  }

  if (!raw.countryRow || typeof raw.countryRow.geonameid !== "number") {
    fail(`${where}: countryRow.geonameid is required (it is in countryInfo.txt)`);
  }
  if (typeof raw.countryRow.nameLanguage !== "string") {
    fail(
      `${where}: countryRow.nameLanguage is required — a country record's dump name is its ` +
        `long English form, so the canonical native name has to be named explicitly`,
    );
  }

  const levels = {};
  for (const [file, fileLevels] of Object.entries(raw.levels ?? {})) {
    if (!raw.isoFiles.includes(file)) {
      fail(`${where}: levels declares file "${file}", which is not in isoFiles`);
    }
    const normalized = {};
    for (const [level, mapping] of Object.entries(fileLevels)) {
      if (!raw.levelOrder.includes(level)) {
        fail(`${where}: levels.${file} declares "${level}", which is not in levelOrder`);
      }
      if (typeof mapping.fcode !== "string" || mapping.fcode === "") {
        fail(`${where}: levels.${file}.${level}.fcode is required (an exact live feature code)`);
      }
      if (mapping.fcode.endsWith("H")) {
        fail(
          `${where}: levels.${file}.${level}.fcode is "${mapping.fcode}" — the H variants are ` +
            `GeoNames' historical rows and are never live`,
        );
      }
      // `ADM2` → `admin2`. The common case, stated once here instead of in
      // every entry; a file that disagrees says so explicitly.
      const derivedField = `admin${mapping.fcode.replace(/^ADM/, "")}`;
      const codeField = mapping.codeField ?? (CODE_FIELDS.includes(derivedField) ? derivedField : null);
      if (codeField !== null && !CODE_FIELDS.includes(codeField)) {
        fail(`${where}: levels.${file}.${level}.codeField "${codeField}" is not one of ${CODE_FIELDS.join(", ")}`);
      }
      if (codeField === null) {
        fail(
          `${where}: levels.${file}.${level} has no codeField and none could be derived from ` +
            `fcode "${mapping.fcode}" — name the admin column holding this level's key`,
        );
      }

      let officialCode = { from: "codeField" };
      if (mapping.officialCode === null) officialCode = { from: "none" };
      else if (mapping.officialCode !== undefined) {
        const digits = mapping.officialCode.fromMunicipalityPrefix;
        const literal = mapping.officialCode.literal;
        if (typeof literal === "string") {
          if (literal === "") fail(`${where}: levels.${file}.${level}.officialCode.literal is empty`);
          officialCode = { from: "literal", literal };
        } else if (typeof digits === "number" && digits > 0) {
          officialCode = { from: "municipalityPrefix", digits };
        } else {
          fail(
            `${where}: levels.${file}.${level}.officialCode must be null, omitted, ` +
              `{ literal: "<code>" }, or { fromMunicipalityPrefix: <digits> }`,
          );
        }
      }

      if (mapping.parent !== undefined) {
        if (typeof mapping.parent.type !== "string" || typeof mapping.parent.externalCode !== "string") {
          fail(`${where}: levels.${file}.${level}.parent must be { type, externalCode }`);
        }
      }

      normalized[level] = {
        fcode: mapping.fcode,
        codeField,
        officialCode,
        parent: mapping.parent ?? null,
      };
    }
    levels[file] = normalized;
  }

  for (const file of raw.isoFiles) {
    if (!levels[file]) fail(`${where}: isoFiles lists "${file}" but levels declares no mapping for it`);
  }

  const pins = (raw.pins ?? []).map((pin, i) => {
    const at = `${where}: pins[${i}]`;
    if (typeof pin.type !== "string" || !raw.levelOrder.includes(pin.type)) {
      fail(`${at}.type must be one of ${raw.levelOrder.join(", ")}`);
    }
    if (typeof pin.externalCode !== "string" || pin.externalCode === "") {
      fail(`${at}.externalCode is required — a pin is addressed by (type, official code)`);
    }
    const attaches = typeof pin.geonameid === "number";
    const synthetic = typeof pin.name === "string";
    if (attaches === synthetic) {
      fail(`${at} must give exactly one of geonameid (attach an upstream record) or name (declare a synthetic row)`);
    }
    if (pin.parent !== undefined && pin.parent !== null) {
      if (typeof pin.parent.type !== "string" || typeof pin.parent.externalCode !== "string") {
        fail(`${at}.parent must be { type, externalCode }`);
      }
    }
    return {
      type: pin.type,
      externalCode: pin.externalCode,
      geonameid: attaches ? pin.geonameid : null,
      name: synthetic ? pin.name : null,
      file: pin.file ?? null,
      parent: pin.parent ?? null,
    };
  });

  const exclude = raw.exclude ?? [];
  if (!Array.isArray(exclude) || exclude.some((id) => typeof id !== "number")) {
    fail(`${where}: exclude must be an array of geonameids`);
  }

  const expected = {};
  for (const level of raw.levelOrder) {
    if (raw.expected?.[level] === undefined) {
      fail(
        `${where}: expected.${level} is missing. The count comes from the national statistical ` +
          `agency, never from the files being read — that is what makes it a gate.`,
      );
    }
    expected[level] = normalizeExpected(raw.expected[level], `${where}: expected.${level}`);
  }

  return {
    iso,
    isoFiles: raw.isoFiles,
    levelOrder: raw.levelOrder,
    nameResolution,
    alternateLocales: raw.alternateLocales,
    levels,
    countryRow: raw.countryRow,
    pins,
    exclude: new Set(exclude),
    expected,
    postal: raw.postal ?? null,
  };
}
