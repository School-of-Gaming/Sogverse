/**
 * The official administrative-division classifications behind everything this
 * repo knows about places: downloaded, parsed, and reconciled with our
 * canonical names, once, here.
 *
 * Two generators consume it and must never drift apart, which is why the
 * download/parse/naming machinery lives in one module rather than in either of
 * them:
 *
 *   - `scripts/generate-location-catalogs.mjs` emits the shipped static
 *     catalogs (`src/lib/locations/catalog/*.json`) that human eyes browse.
 *   - `scripts/generate-france-communes-migration.mjs` emits the France commune
 *     seed migration that the database's query engine reads.
 *
 * A catalog name and the `locations.name` of the corresponding row have to
 * agree or the same place shows up twice under two spellings. Sharing this
 * module is what makes that true by construction instead of by review.
 *
 * ## Sources (downloaded at run time, never committed)
 *
 * France — INSEE, Code officiel géographique. The annual release has an
 * information page carrying the file ids; 2026 is page 8740222, and its three
 * "v_*" files are the authoritative flat lists:
 *
 *   https://www.insee.fr/fr/information/8740222
 *   https://www.insee.fr/fr/statistiques/fichier/8740222/v_region_2026.csv
 *   https://www.insee.fr/fr/statistiques/fichier/8740222/v_departement_2026.csv
 *   https://www.insee.fr/fr/statistiques/fichier/8740222/v_commune_2026.csv
 *
 * data.gouv.fr mirrors the same dataset ("Code officiel géographique (COG)") if
 * insee.fr is unreachable; the file contents are identical.
 *
 * Finland — Statistics Finland (Tilastokeskus) open classifications API. The
 * classification ids are date-stamped, one per annual release:
 *
 *   https://data.stat.fi/api/classifications/v2/classifications/kunta_1_20260101/classificationItems
 *   https://data.stat.fi/api/classifications/v2/classifications/maakunta_1_20260101/classificationItems
 *   https://data.stat.fi/api/classifications/v2/correspondenceTables/kunta_1_20260101%23maakunta_1_20260101/maps
 *
 * ## Annual refresh
 *
 * Both classifications are republished each January. To refresh:
 *
 *   1. Bump `FR.release` / `FR.datasetId` to the new COG information-page id
 *      (from insee.fr/fr/information/…), and `FI.release` to the new
 *      `…_1_YYYY0101` stamp.
 *   2. Bump the `expected` counts in the same config block to the new official
 *      totals. They are asserted exactly, so a refresh that silently loses half
 *      a file fails here instead of shipping. Changing a count is a deliberate,
 *      reviewable edit — that is the point of them.
 *   3. Rerun `scripts/generate-location-catalogs.mjs` and diff the emitted JSON.
 *      Communes merge and rename between releases, so expect churn; commit it.
 *   4. Reconcile the database by hand, in a NEW migration. Do not regenerate an
 *      already-applied seed migration: it is history. A rename that collapses
 *      two rows is a judgement call about live references (products, sites,
 *      gedu coverage), not something a generator should decide. Compare the new
 *      catalog against `select external_code, name from locations where
 *      country_code = …` and write the differences up as a migration.
 *
 * ## Names must match the database
 *
 * Finland's seeded rows predate this machinery and use the Finnish form of
 * bilingual municipality names, while Statistics Finland publishes some of them
 * in the combined form — `FI_CANONICAL_NAMES` below reconciles the two, and is
 * asserted against upstream so a stale entry fails loudly. Keep it in step with
 * the seed: the Finland `external_code` backfill migration was generated from
 * this same source and override map, so the two agree by construction. France
 * needs no such map — INSEE's LIBELLE *is* our canonical French name.
 */

/* ------------------------------------------------------------------ config */

export const FR = {
  country: "FR",
  release: "2026",
  datasetId: "8740222",
  source: "INSEE Code officiel géographique 2026",
  levels: ["region", "district", "municipality"],
  expected: [18, 101, 34875],
};

export const FI = {
  country: "FI",
  release: "2026",
  stamp: "1_20260101",
  source: "Tilastokeskus luokitukset (kunnat / maakunnat) 2026",
  levels: ["region", "municipality"],
  expected: [19, 308],
};

/**
 * Statistics Finland name -> the canonical name our `locations` rows use, keyed
 * by kunta/maakunta code. Each entry is a deliberate divergence, not a typo
 * fix, and is asserted below: if upstream ever adopts our spelling the entry
 * becomes a no-op and the script fails, forcing it to be deleted.
 */
const FI_CANONICAL_NAMES = new Map([
  // Åland's capital is officially bilingual and Tilastokeskus publishes the
  // combined form. Our Finland seed stores the Finnish form for every bilingual
  // municipality (Mustasaari, Närpiö, …), so this one follows the same rule.
  ["478", { upstream: "Maarianhamina - Mariehamn", canonical: "Maarianhamina" }],
]);

/* ------------------------------------------------------------------- utils */

export function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

async function getText(url) {
  const response = await fetch(url);
  if (!response.ok) fail(`GET ${url} -> ${response.status} ${response.statusText}`);
  return response.text();
}

async function getJson(url) {
  return JSON.parse(await getText(url));
}

/** Minimal RFC-4180 reader — the INSEE files quote every field and embed commas. */
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ""]));
  });
}

function splitCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

/** Groups `items` by `key`, preserving nothing about order (the caller sorts). */
function groupBy(items, key) {
  const groups = new Map();
  for (const item of items) {
    const k = key(item);
    const bucket = groups.get(k);
    if (bucket) bucket.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

/* ------------------------------------------------------------------ France */

/**
 * The France tree: région -> département -> commune, each node a
 * `[code, name, children?]` tuple, sorted by name under French collation.
 */
export async function buildFrance() {
  const base = `https://www.insee.fr/fr/statistiques/fichier/${FR.datasetId}/`;
  const [regions, departments, communes] = await Promise.all([
    getText(`${base}v_region_${FR.release}.csv`).then(parseCsv),
    getText(`${base}v_departement_${FR.release}.csv`).then(parseCsv),
    getText(`${base}v_commune_${FR.release}.csv`).then(parseCsv),
  ]);

  // The commune file also carries communes déléguées/associées (COMD/COMA) and
  // the arrondissements municipaux of Paris, Lyon and Marseille (ARM). None of
  // those is a commune; only TYPECOM = 'COM' is.
  const actual = communes.filter((c) => c.TYPECOM === "COM");

  const collator = new Intl.Collator("fr");
  const byName = (a, b) => collator.compare(a[1], b[1]);

  const communesByDep = groupBy(actual, (c) => c.DEP);
  const depsByRegion = groupBy(departments, (d) => d.REG);

  const tree = regions
    .map((region) => {
      const deps = (depsByRegion.get(region.REG) ?? [])
        .map((dep) => {
          const leaves = (communesByDep.get(dep.DEP) ?? [])
            .map((c) => [c.COM, c.LIBELLE])
            .sort(byName);
          if (leaves.length === 0) {
            fail(`FR: département ${dep.DEP} (${dep.LIBELLE}) has no communes`);
          }
          return [dep.DEP, dep.LIBELLE, leaves];
        })
        .sort(byName);
      if (deps.length === 0) {
        fail(`FR: région ${region.REG} (${region.LIBELLE}) has no départements`);
      }
      return [region.REG, region.LIBELLE, deps];
    })
    .sort(byName);

  // Nothing may be dropped on the floor: an unknown DEP or REG silently loses
  // whole départements, which is exactly the failure the counts above catch
  // late and this catches with a name.
  const placedDeps = new Set(departments.map((d) => d.DEP));
  const orphanCommunes = actual.filter((c) => !placedDeps.has(c.DEP));
  if (orphanCommunes.length > 0) {
    fail(
      `FR: ${orphanCommunes.length} communes reference an unknown département ` +
        `(e.g. ${orphanCommunes[0].LIBELLE} -> ${orphanCommunes[0].DEP})`
    );
  }
  const placedRegions = new Set(regions.map((r) => r.REG));
  const orphanDeps = departments.filter((d) => !placedRegions.has(d.REG));
  if (orphanDeps.length > 0) {
    fail(
      `FR: ${orphanDeps.length} départements reference an unknown région ` +
        `(e.g. ${orphanDeps[0].LIBELLE} -> ${orphanDeps[0].REG})`
    );
  }

  return tree;
}

/* ----------------------------------------------------------------- Finland */

/**
 * The Finland tree (maakunta -> kunta) plus the canonical-name reconciliations
 * that were applied, so the caller can print them for review.
 */
export async function buildFinland() {
  const base = "https://data.stat.fi/api/classifications/v2/";
  const items = `classificationItems?content=data&meta=min&lang=fi&format=json`;
  const [municipalities, regions, correspondence] = await Promise.all([
    getJson(`${base}classifications/kunta_${FI.stamp}/${items}`),
    getJson(`${base}classifications/maakunta_${FI.stamp}/${items}`),
    getJson(
      `${base}correspondenceTables/kunta_${FI.stamp}%23maakunta_${FI.stamp}/maps` +
        `?content=data&meta=min&lang=fi&format=json`
    ),
  ]);

  const upstreamName = (item) => item.classificationItemNames[0].name;

  // Apply, and validate, the divergences from our seeded canonical names.
  const applied = [];
  const canonicalName = (item) => {
    const override = FI_CANONICAL_NAMES.get(item.code);
    if (!override) return upstreamName(item);
    const upstream = upstreamName(item);
    if (upstream !== override.upstream) {
      fail(
        `FI: canonical-name override for code ${item.code} expected upstream ` +
          `"${override.upstream}" but Tilastokeskus now publishes "${upstream}". ` +
          `Re-check the override against the database's canonical name and update or delete it.`
      );
    }
    applied.push({ code: item.code, upstream, canonical: override.canonical });
    return override.canonical;
  };

  // localId is "<classification>/<code>" on both ends of a correspondence row.
  const regionOfMunicipality = new Map(
    correspondence.map((m) => [
      m.sourceLocalId.split("/")[1],
      m.targetLocalId.split("/")[1],
    ])
  );

  const collator = new Intl.Collator("fi");
  const byName = (a, b) => collator.compare(a[1], b[1]);

  const byRegion = groupBy(municipalities, (m) => {
    const region = regionOfMunicipality.get(m.code);
    if (!region) fail(`FI: kunta ${m.code} (${upstreamName(m)}) maps to no maakunta`);
    return region;
  });

  const tree = regions
    .map((region) => {
      const leaves = (byRegion.get(region.code) ?? [])
        .map((m) => [m.code, canonicalName(m)])
        .sort(byName);
      if (leaves.length === 0) {
        fail(`FI: maakunta ${region.code} (${upstreamName(region)}) has no kunnat`);
      }
      return [region.code, canonicalName(region), leaves];
    })
    .sort(byName);

  const unapplied = [...FI_CANONICAL_NAMES.keys()].filter(
    (code) => !applied.some((a) => a.code === code)
  );
  if (unapplied.length > 0) {
    fail(
      `FI: canonical-name override(s) for code(s) ${unapplied.join(", ")} matched nothing ` +
        `in the ${FI.release} classification. Delete them, or fix the code.`
    );
  }

  return { tree, applied };
}
