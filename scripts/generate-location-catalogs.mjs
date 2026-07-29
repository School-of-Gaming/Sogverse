/**
 * Generates the shipped location catalogs in `src/lib/locations/catalog/`.
 *
 *   node scripts/generate-location-catalogs.mjs
 *
 * A catalog is the exhaustive list of one country's official administrative
 * divisions, committed as a static JSON asset and loaded into the browser
 * behind a dynamic import. Admins browse and search it with no network
 * round-trip. It is what human eyes read; the `locations` table is what the
 * server-side query engine reads, and the two are seeded from the same official
 * release. The emitted shape is documented in
 * `src/lib/locations/catalog/types.ts`.
 *
 * The official releases themselves — source URLs, download/parse, the
 * canonical-name reconciliation, and the annual refresh procedure — live in
 * `scripts/lib/location-classifications.mjs`, shared with the France commune
 * seed generator so a catalog name and a database row name cannot drift.
 *
 * This file is only the catalog *emitter*: assertions on the built trees, the
 * compact serializer, and the size report.
 */
import { writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  FR,
  FI,
  fail,
  buildFrance,
  buildFinland,
} from "./lib/location-classifications.mjs";

const OUT_DIR = join(import.meta.dirname, "..", "src", "lib", "locations", "catalog");

/* --------------------------------------------------------------- assertions */

/** Depth-first node count per level, index 0 = roots. */
function countLevels(tree) {
  const counts = [];
  const walk = (nodes, depth) => {
    counts[depth] = (counts[depth] ?? 0) + nodes.length;
    for (const [, , children] of nodes) if (children) walk(children, depth + 1);
  };
  walk(tree, 0);
  return counts;
}

function assertCounts(config, tree) {
  const counts = countLevels(tree);
  if (counts.length !== config.expected.length) {
    fail(
      `${config.country}: catalog has ${counts.length} levels, expected ${config.expected.length}`
    );
  }
  for (const [depth, expected] of config.expected.entries()) {
    if (counts[depth] !== expected) {
      fail(
        `${config.country}: expected ${expected} ${config.levels[depth]} entries, got ${counts[depth]}. ` +
          `If the official release genuinely changed, bump the expected count in the config block ` +
          `of scripts/lib/location-classifications.mjs.`
      );
    }
  }
  return counts;
}

/**
 * Every code must be unique *nationally within its level* — that is exactly the
 * key `locations.external_code` is uniqued on, so a duplicate here would become
 * a constraint violation the first time both entries were seeded. Checking
 * per-parent instead would miss it.
 */
function assertUniqueCodes(config, tree) {
  const seen = config.levels.map(() => new Set());
  const walk = (nodes, depth) => {
    for (const [code, name, children] of nodes) {
      if (seen[depth].has(code)) {
        fail(`${config.country}: duplicate ${config.levels[depth]} code "${code}" (${name})`);
      }
      seen[depth].add(code);
      if (children) walk(children, depth + 1);
    }
  };
  walk(tree, 0);
}

/* -------------------------------------------------------------------- emit */

/**
 * Compact JSON, one node per line. `JSON.stringify(…, null, 2)` would roughly
 * double a 34,875-entry file for nothing, and a single line would make every
 * annual refresh a one-line diff nobody can review. A bare newline between
 * nodes costs ~3% and buys a diff that names the communes that changed.
 */
function serializeNode(node) {
  const [code, name, children] = node;
  const head = `[${JSON.stringify(code)},${JSON.stringify(name)}`;
  if (!children) return `${head}]`;
  return `${head},[\n${children.map(serializeNode).join(",\n")}\n]]`;
}

function emit(config, tree) {
  assertUniqueCodes(config, tree);
  const counts = assertCounts(config, tree);

  const header = {
    country: config.country,
    source: config.source,
    release: config.release,
    // Provenance stamp, deliberately UTC: this marks when the asset was
    // generated, not anyone's local "today" — the case the repo-wide ban on
    // toISOString().slice() dates exists to protect doesn't apply to it.
    generated: new Date().toISOString().slice(0, 10),
    levels: config.levels,
    counts,
  };

  const json =
    `{\n` +
    Object.entries(header)
      .map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`)
      .join(",\n") +
    `,\n"tree":[\n${tree.map(serializeNode).join(",\n")}\n]}\n`;

  // Cheap proof the hand-rolled serializer still emits valid JSON of the shape
  // `src/lib/locations/catalog/types.ts` declares.
  const roundTrip = JSON.parse(json);
  if (roundTrip.tree.length !== tree.length) {
    fail(`${config.country}: serialized catalog did not round-trip`);
  }

  const file = join(OUT_DIR, `${config.country.toLowerCase()}.json`);
  writeFileSync(file, json, "utf8");

  return { file, counts, raw: statSync(file).size, gzip: gzipSync(json).length };
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/* -------------------------------------------------------------------- main */

const [frTree, fi] = await Promise.all([buildFrance(), buildFinland()]);

console.log("Finnish name reconciliations (Tilastokeskus -> our canonical name):");
if (fi.applied.length === 0) {
  console.log("  (none)");
} else {
  for (const { code, upstream, canonical } of fi.applied) {
    console.log(`  ${code}  "${upstream}" -> "${canonical}"`);
  }
}

console.log("\nWrote:");
for (const config of [FR, FI]) {
  const tree = config === FR ? frTree : fi.tree;
  const { file, counts, raw, gzip } = emit(config, tree);
  const breakdown = config.levels
    .map((level, i) => `${counts[i]} ${level}`)
    .join(", ");
  console.log(`  ${file}`);
  console.log(`    ${breakdown}`);
  console.log(`    ${kb(raw)} raw, ${kb(gzip)} gzipped`);
}
