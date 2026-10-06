import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CATALOGUE_IMAGE_PURPOSES } from "@/lib/images/catalogue-image-purposes";
import { IMAGE_PURPOSES, type ImagePurposeSpec } from "@/lib/images/image-purposes";

/**
 * **Every storage bucket has exactly one image purpose, and agrees with it.**
 *
 * The registry is only worth consulting if it is complete: a bucket added by a
 * migration and never declared would be a set of pictures nothing knows how to
 * serve, and a purpose whose visibility disagrees with the bucket's `public`
 * flag is either a preview that 404s or a private photo answered to anyone.
 * The bucket list is read from the generated storage schema on every run, so a
 * bucket added tomorrow fails here the same way a missing one would today.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const BUCKETS_FILE = "supabase/schema/outside-public/storage-buckets.sql";

/** One `storage.buckets` row as the schema dump renders it. */
interface BucketRow {
  readonly id: string;
  readonly isPublic: boolean;
}

/**
 * Every bucket in the dump. Each row is an `INSERT ... VALUES ('<id>',
 * '<name>', <true|false>, ...)`, and the dump is generated, so its shape is
 * stable; a row this pattern cannot read fails the count check below rather
 * than vanishing.
 */
function bucketsInSchema(): BucketRow[] {
  const sql = readFileSync(join(repoRoot, BUCKETS_FILE), "utf8");
  const inserts = sql.match(/INSERT INTO storage\.buckets/g) ?? [];
  const rows = [
    ...sql.matchAll(
      /INSERT INTO storage\.buckets\s*\([^)]*\)\s*VALUES\s*\(\s*'([^']+)'\s*,\s*'[^']*'\s*,\s*(true|false)\s*,/g,
    ),
  ].map(([, id, isPublic]) => ({ id, isPublic: isPublic === "true" }));
  expect(rows.length, `Every INSERT in ${BUCKETS_FILE} should parse as a bucket row.`).toBe(
    inserts.length,
  );
  return rows;
}

/** The registry as plain entries, widened to the spec every purpose satisfies. */
const purposes: readonly (readonly [string, ImagePurposeSpec])[] = Object.entries(IMAGE_PURPOSES);

describe("the image purpose registry", () => {
  const buckets = bucketsInSchema();

  it("reads at least one bucket from the schema", () => {
    expect(buckets.length).toBeGreaterThan(0);
  });

  it("gives every storage bucket a purpose", () => {
    const declared = new Set(purposes.map(([, spec]) => spec.bucket));
    const missing = buckets.filter(({ id }) => !declared.has(id)).map(({ id }) => id);
    expect(
      missing,
      "These buckets exist in storage but no purpose in src/lib/images/image-purposes.ts names them — declare one.",
    ).toEqual([]);
  });

  it("names no bucket that does not exist", () => {
    const existing = new Set(buckets.map(({ id }) => id));
    const dangling = purposes
      .filter(([, spec]) => !existing.has(spec.bucket))
      .map(([purpose, spec]) => `${purpose} → ${spec.bucket}`);
    expect(dangling, `These purposes name a bucket ${BUCKETS_FILE} does not have.`).toEqual([]);
  });

  it("names each bucket in exactly one purpose", () => {
    const byBucket = new Map<string, string[]>();
    for (const [purpose, spec] of purposes) {
      byBucket.set(spec.bucket, [...(byBucket.get(spec.bucket) ?? []), purpose]);
    }
    const shared = [...byBucket]
      .filter(([, owners]) => owners.length > 1)
      .map(([bucket, owners]) => `${bucket}: ${owners.join(", ")}`);
    expect(shared, "A bucket is one purpose; these are named by several.").toEqual([]);
  });

  it("matches each bucket's public flag to its purpose's visibility", () => {
    const flags = new Map(buckets.map(({ id, isPublic }) => [id, isPublic]));
    const disagreeing = purposes
      .filter(([, spec]) => flags.has(spec.bucket))
      .filter(([, spec]) => flags.get(spec.bucket) !== (spec.visibility === "public"))
      .map(
        ([purpose, spec]) =>
          `${purpose} (${spec.bucket}): registry says ${spec.visibility}, bucket public = ${flags.get(spec.bucket)}`,
      );
    expect(disagreeing).toEqual([]);
  });
});

describe("the catalogue purposes derived from the registry", () => {
  it("carry each catalogue purpose's bucket and stored size", () => {
    const registry = new Map(purposes);
    for (const [purpose, spec] of Object.entries(CATALOGUE_IMAGE_PURPOSES)) {
      const registered = registry.get(purpose);
      expect(registered?.catalogue, `${purpose} has no catalogue block in the registry`).toBeDefined();
      expect(spec, purpose).toEqual({
        bucket: registered?.bucket,
        width: registered?.catalogue?.width,
        height: registered?.catalogue?.height,
      });
    }
  });

  it("are exactly the registry's purposes with a catalogue block", () => {
    const withCatalogue = purposes
      .filter(([, spec]) => spec.catalogue !== undefined)
      .map(([purpose]) => purpose)
      .sort();
    expect(Object.keys(CATALOGUE_IMAGE_PURPOSES).sort()).toEqual(withCatalogue);
  });

  it("are all public, since their URLs are built for anonymous readers", () => {
    const privateCatalogue = purposes
      .filter(([, spec]) => spec.catalogue !== undefined && spec.visibility !== "public")
      .map(([purpose]) => purpose);
    expect(privateCatalogue).toEqual([]);
  });
});
