/**
 * The official administrative-division classification behind the France commune
 * seed: downloaded, parsed, and reconciled with our canonical names, once, here.
 *
 * One generator consumes it —
 * `scripts/generate-france-communes-migration.mjs`, which emits the seed
 * migration the database's query engine reads. It used to have a sibling that
 * emitted static per-country JSON catalogs for the browser to search; those are
 * gone, along with the reason this module had two consumers to keep in step. The
 * picker now browses and searches the seeded rows themselves, so `locations.name`
 * is the only name of a place anything renders.
 *
 * ## Source (downloaded at run time, never committed)
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
 * ## Refresh (ad-hoc — nothing is scheduled)
 *
 * The classification is republished each January, but refreshing is a manual,
 * when-it-matters decision, not a standing job. To refresh:
 *
 *   1. Bump `FR.release` / `FR.datasetId` to the new COG information-page id
 *      (from insee.fr/fr/information/…).
 *   2. Bump the `expected` counts in the same config block to the new official
 *      totals. They are asserted exactly, so a refresh that silently loses half
 *      a file fails here instead of shipping. Changing a count is a deliberate,
 *      reviewable edit — that is the point of them.
 *   3. Reconcile the database by hand, in a NEW migration. Do not regenerate an
 *      already-applied seed migration: it is history. A rename that collapses
 *      two rows is a judgement call about live references (products, sites,
 *      gedu coverage), not something a generator should decide. Compare the new
 *      release against `select external_code, name from locations where
 *      country_code = 'FR'` and write the differences up as a migration.
 *
 * ## Finland has no generator, and never did
 *
 * Finland's rows were seeded by hand-written migrations from Statistics
 * Finland's kunta/maakunta classifications
 * (https://data.stat.fi/api/classifications/v2/), and its refresh is the same
 * hand-written migration as step 3 above. Two facts from that seeding are worth
 * keeping where the next person will look for them:
 *
 *   - Our rows store the **Finnish** form of every bilingual municipality name,
 *     while Tilastokeskus publishes some of them combined — Åland's capital is
 *     "Maarianhamina - Mariehamn" upstream and "Maarianhamina" here. A
 *     comparison against upstream has to account for that or it reports a
 *     rename that did not happen.
 *   - The official Swedish names live in `name_i18n`, not in `name`; upstream's
 *     combined form is not a second name, it is one name written twice.
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

/**
 * CSV reader for the shapes this source actually ships: quoted fields with
 * embedded commas and doubled quotes. NOT a full RFC-4180 parser — it splits
 * on newlines before parsing quotes, so a quoted field containing a newline
 * would desync every following row. INSEE has never shipped one; if a
 * release does, the count assertions downstream fail loudly.
 */
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
