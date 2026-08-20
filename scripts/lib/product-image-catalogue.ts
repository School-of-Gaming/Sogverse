/**
 * The decidable half of the product-image cleanup: extension normalisation,
 * label derivation, backup-manifest verification and the link plan itself.
 *
 * Everything here is a pure function over values the script has already
 * fetched, which is the point — the run that matters is a one-shot against a
 * live project with the owner watching, and "what will it do" has to be
 * answerable without a network. `scripts/link-product-images.ts` does the IO
 * and prints what these functions decide; the unit test in
 * `tests/unit/scripts/` exercises them directly.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Objects and extensions
// ---------------------------------------------------------------------------

/**
 * The accept list the two admin product routes use today, restated rather than
 * imported: a Next route handler cannot be pulled into a `tsx` script, and this
 * script must agree with what those routes were willing to store. Nothing is
 * re-encoded, so nothing here is dropped — an extension outside this map is an
 * object the routes could not have written, and the script refuses rather than
 * guessing a type for it.
 */
const MIME_BY_EXT = new Map<string, string>([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["avif", "image/avif"],
  ["svg", "image/svg+xml"],
]);

export interface ObjectExtension {
  /** Canonical spelling stored in a catalogue path — `jpeg` collapses to `jpg`. */
  ext: string;
  contentType: string;
}

/**
 * The extension a catalogue path should carry for a legacy object key, and the
 * content type to upload the copied bytes with. `null` for anything outside the
 * accept list.
 */
export function normaliseExtension(objectPath: string): ObjectExtension | null {
  const basename = objectPath.split("/").pop() ?? "";
  const dot = basename.lastIndexOf(".");
  if (dot <= 0) return null;
  const raw = basename.slice(dot + 1).toLowerCase();
  const contentType = MIME_BY_EXT.get(raw);
  if (!contentType) return null;
  return { ext: raw === "jpeg" ? "jpg" : raw, contentType };
}

/**
 * The shape of a catalogue key: the lowercase hex sha256 of the bytes, then the
 * extension. Used for reporting and for the post-run assertion only —
 * membership in `product_images.path` is what actually decides whether a path
 * is a catalogue path, because that is the table the trigger reads.
 */
export function looksLikeCataloguePath(objectPath: string): boolean {
  return /^[0-9a-f]{64}\.[a-z0-9]+$/.test(objectPath);
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** `product_images.label` is CHECKed to 1..120 characters. */
export const MAX_LABEL_LENGTH = 120;

/**
 * The label a generated entry gets: the product's own name, trimmed and capped,
 * or `Image` when the product has no name to lend. Deliberately plain — the
 * heavily-shared pictures get relabelled by hand through the dialog once the
 * app ships, and a cleverer guess here would only be a better-looking wrong
 * answer for a picture 22 products share.
 */
export function deriveLabel(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (trimmed === "") return "Image";
  const capped = trimmed.slice(0, MAX_LABEL_LENGTH).trim();
  return capped === "" ? "Image" : capped;
}

// ---------------------------------------------------------------------------
// The link plan
// ---------------------------------------------------------------------------

/** A product carrying a picture, with the name that may become an entry label. */
export interface ImagedProduct {
  id: string;
  imagePath: string;
  imageId: string | null;
  /** ISO timestamp; the earliest-created product lends its name to the entry. */
  createdAt: string;
  /** Default-locale name, already resolved by the caller. */
  name: string | null;
}

export interface CatalogueRow {
  id: string;
  sha256: string;
  path: string;
  label: string;
}

/** What downloading and hashing one legacy object produced. */
export type LegacyResolution =
  | { kind: "hashed"; sha256: string; ext: string }
  | { kind: "missing" };

export type PathAction =
  /** Already a catalogue path, and every product on it already points at the entry. */
  | { kind: "already-linked"; entryId: string }
  /** Already a catalogue path, but some product still has no `image_id`. */
  | { kind: "link-only"; entryId: string }
  /** These bytes have no entry: this path's group creates it. */
  | { kind: "create-entry"; sha256: string; targetPath: string; label: string }
  /**
   * These bytes already have an entry, or a sibling legacy path in this same
   * run creates one for them (`entryId: null` — the id is only known once the
   * insert has happened).
   */
  | { kind: "reuse-entry"; sha256: string; targetPath: string; entryId: string | null }
  /** The legacy object is gone from the bucket. */
  | { kind: "missing-object" };

export interface PathPlan {
  path: string;
  isCataloguePath: boolean;
  products: ImagedProduct[];
  /** The subset whose `image_id` still has to be written. */
  toLink: ImagedProduct[];
  action: PathAction;
}

/**
 * One distinct image, by bytes. This is the unit of work: legacy duplicates
 * collapse into one group, one object and one row, and every product across
 * every contributing path ends up pointing at it.
 */
export interface HashGroup {
  sha256: string;
  ext: string;
  targetPath: string;
  label: string;
  /** The row these bytes already have, when they have one. */
  existing: CatalogueRow | null;
  legacyPaths: string[];
  products: ImagedProduct[];
}

export interface LinkSummary {
  imagedProducts: number;
  distinctPaths: number;
  legacyPaths: number;
  cataloguePaths: number;
  distinctHashes: number;
  entriesToCreate: number;
  entriesReused: number;
  productsToRelink: number;
  missingLegacyObjects: number;
  productsWithMissingObject: number;
  /** True when an `--apply` would write nothing at all. */
  nothingToDo: boolean;
}

export interface LinkPlan {
  paths: PathPlan[];
  groups: HashGroup[];
  missing: PathPlan[];
  summary: LinkSummary;
}

/** Earliest `created_at` wins; the id breaks a tie so the answer is stable. */
function byCreation(a: ImagedProduct, b: ImagedProduct): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Everything `--apply` would do, decided from rows and hashes alone.
 *
 * `resolutions` carries one entry per **legacy** path (a path with no
 * `product_images` row): the sha256 and canonical extension of its bytes, or
 * `missing` when the object is gone. Catalogue paths are never hashed — their
 * row already names the bytes — so they never appear there.
 */
export function computeLinkPlan(
  products: ImagedProduct[],
  catalogue: CatalogueRow[],
  resolutions: Map<string, LegacyResolution>,
): LinkPlan {
  const catalogueByPath = new Map(catalogue.map((row) => [row.path, row]));
  const catalogueBySha = new Map(catalogue.map((row) => [row.sha256, row]));

  const byPath = new Map<string, ImagedProduct[]>();
  for (const product of products) {
    const siblings = byPath.get(product.imagePath) ?? [];
    siblings.push(product);
    byPath.set(product.imagePath, siblings);
  }
  const paths = [...byPath.keys()].sort();

  // Pass one: catalogue paths resolve on the spot; legacy paths are collected
  // by content hash, because two of them may be the same picture.
  const hashed = new Map<string, { paths: string[]; products: ImagedProduct[] }>();
  const cataloguePlans = new Map<string, PathPlan>();
  const missingPlans = new Map<string, PathPlan>();

  for (const path of paths) {
    const group = (byPath.get(path) ?? []).slice().sort(byCreation);
    const entry = catalogueByPath.get(path);
    if (entry) {
      const toLink = group.filter((p) => p.imageId !== entry.id);
      cataloguePlans.set(path, {
        path,
        isCataloguePath: true,
        products: group,
        toLink,
        action:
          toLink.length > 0
            ? { kind: "link-only", entryId: entry.id }
            : { kind: "already-linked", entryId: entry.id },
      });
      continue;
    }

    const resolution = resolutions.get(path);
    if (!resolution || resolution.kind === "missing") {
      missingPlans.set(path, {
        path,
        isCataloguePath: false,
        products: group,
        toLink: [],
        action: { kind: "missing-object" },
      });
      continue;
    }

    const bucket = hashed.get(resolution.sha256) ?? { paths: [], products: [] };
    bucket.paths.push(path);
    bucket.products.push(...group);
    hashed.set(resolution.sha256, bucket);
  }

  // Pass two: one group per distinct hash. The earliest-created product across
  // every contributing path lends both its name (the label) and its path's
  // extension, so two legacy copies of one picture give a deterministic answer
  // regardless of which one the walk met first.
  const groups: HashGroup[] = [];
  const groupBySha = new Map<string, HashGroup>();
  for (const [sha256, bucket] of [...hashed.entries()].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    const contributors = bucket.products.slice().sort(byCreation);
    const earliest = contributors[0];
    const earliestResolution = resolutions.get(earliest.imagePath);
    const ext =
      earliestResolution && earliestResolution.kind === "hashed"
        ? earliestResolution.ext
        : "bin";
    const existing = catalogueBySha.get(sha256) ?? null;
    const group: HashGroup = {
      sha256,
      ext,
      // An existing row already named these bytes; its path is the one the
      // trigger will write, whatever extension it happens to carry.
      targetPath: existing ? existing.path : `${sha256}.${ext}`,
      label: existing ? existing.label : deriveLabel(earliest.name),
      existing,
      legacyPaths: bucket.paths.slice().sort(),
      products: contributors,
    };
    groups.push(group);
    groupBySha.set(sha256, group);
  }

  // Pass three: give every legacy path its action. Within a group the first
  // path (sorted) is the one that creates the row; the rest reuse it.
  const legacyPlans = new Map<string, PathPlan>();
  for (const group of groups) {
    for (const [index, path] of group.legacyPaths.entries()) {
      const groupProducts = (byPath.get(path) ?? []).slice().sort(byCreation);
      const action: PathAction =
        group.existing !== null
          ? {
              kind: "reuse-entry",
              sha256: group.sha256,
              targetPath: group.targetPath,
              entryId: group.existing.id,
            }
          : index === 0
            ? {
                kind: "create-entry",
                sha256: group.sha256,
                targetPath: group.targetPath,
                label: group.label,
              }
            : {
                kind: "reuse-entry",
                sha256: group.sha256,
                targetPath: group.targetPath,
                entryId: null,
              };
      legacyPlans.set(path, {
        path,
        isCataloguePath: false,
        products: groupProducts,
        // A legacy path implies no link: the trigger keeps `image_path` equal
        // to the linked entry's path, so a product with an `image_id` cannot be
        // sitting on a path that has no row.
        toLink: groupProducts,
        action,
      });
    }
  }

  const ordered: PathPlan[] = [];
  for (const path of paths) {
    const plan =
      cataloguePlans.get(path) ?? legacyPlans.get(path) ?? missingPlans.get(path);
    if (plan) ordered.push(plan);
  }

  const missing = [...missingPlans.values()];
  const entriesToCreate = groups.filter((g) => g.existing === null).length;
  const productsToRelink = ordered.reduce(
    (total, plan) => total + plan.toLink.length,
    0,
  );

  return {
    paths: ordered,
    groups,
    missing,
    summary: {
      imagedProducts: products.length,
      distinctPaths: paths.length,
      legacyPaths: legacyPlans.size + missing.length,
      cataloguePaths: cataloguePlans.size,
      distinctHashes: groups.length,
      entriesToCreate,
      entriesReused: groups.length - entriesToCreate,
      productsToRelink,
      missingLegacyObjects: missing.length,
      productsWithMissingObject: missing.reduce(
        (total, plan) => total + plan.products.length,
        0,
      ),
      nothingToDo:
        entriesToCreate === 0 && productsToRelink === 0 && missing.length === 0,
    },
  };
}

/** One line of the per-path table, for the report. */
export function describeAction(action: PathAction): string {
  switch (action.kind) {
    case "already-linked":
      return "linked already";
    case "link-only":
      return "link products";
    case "create-entry":
      return `create entry -> ${action.targetPath}`;
    case "reuse-entry":
      return `reuse entry   -> ${action.targetPath}`;
    case "missing-object":
      return "OBJECT MISSING";
  }
}

// ---------------------------------------------------------------------------
// Backup manifests
// ---------------------------------------------------------------------------

export const manifestObject = z.object({
  name: z.string().min(1),
  bytes: z.number().int().nonnegative(),
});

export const backupManifest = z.object({
  bucket: z.string().min(1),
  projectRef: z.string().min(1),
  generatedAt: z.string().min(1),
  objects: z.array(manifestObject),
});

export type ManifestObject = z.infer<typeof manifestObject>;
export type BackupManifest = z.infer<typeof backupManifest>;

export interface ManifestDiff {
  /** In the manifest, absent from the bucket now. */
  missingFromBucket: string[];
  /** In the bucket now, absent from the manifest — i.e. never backed up. */
  missingFromManifest: string[];
  sizeMismatch: { name: string; manifestBytes: number; bucketBytes: number }[];
}

export function manifestDiffIsClean(diff: ManifestDiff): boolean {
  return (
    diff.missingFromBucket.length === 0 &&
    diff.missingFromManifest.length === 0 &&
    diff.sizeMismatch.length === 0
  );
}

/**
 * Does a saved manifest still describe the bucket exactly?
 *
 * `--delete-legacy` will not run unless it does, and the comparison is
 * symmetric on purpose: an object added since the backup is as disqualifying as
 * one that vanished, because the manifest is the claim "every byte in this
 * bucket is on disk somewhere else" and a newer object was never covered by it.
 */
export function verifyManifest(
  manifest: ManifestObject[],
  bucket: ManifestObject[],
): ManifestDiff {
  const manifestByName = new Map(manifest.map((o) => [o.name, o.bytes]));
  const bucketByName = new Map(bucket.map((o) => [o.name, o.bytes]));

  const missingFromBucket: string[] = [];
  const sizeMismatch: ManifestDiff["sizeMismatch"] = [];
  for (const [name, bytes] of manifestByName) {
    const bucketBytes = bucketByName.get(name);
    if (bucketBytes === undefined) {
      missingFromBucket.push(name);
      continue;
    }
    if (bucketBytes !== bytes) {
      sizeMismatch.push({ name, manifestBytes: bytes, bucketBytes });
    }
  }

  const missingFromManifest = [...bucketByName.keys()].filter(
    (name) => !manifestByName.has(name),
  );

  return {
    missingFromBucket: missingFromBucket.sort(),
    missingFromManifest: missingFromManifest.sort(),
    sizeMismatch: sizeMismatch.sort((a, b) => (a.name < b.name ? -1 : 1)),
  };
}

// ---------------------------------------------------------------------------
// Deletion candidates
// ---------------------------------------------------------------------------

export interface BucketObject {
  name: string;
  bytes: number;
  /** ISO timestamp from the storage listing. */
  createdAt: string;
}

export interface DeletionPlan {
  remove: BucketObject[];
  /** Referenced by a `product_images` row — never removed. */
  referenced: BucketObject[];
  /** Younger than the cutoff: skipped, because an upload may still be settling. */
  tooNew: BucketObject[];
}

/**
 * What `--delete-legacy` would remove: every object no catalogue row names,
 * minus anything uploaded in the last day.
 *
 * The age floor is the one guard that is not about correctness of the data but
 * about the clock — a run racing an admin's upload would otherwise delete bytes
 * whose row is a second away from being inserted.
 */
export function planLegacyDeletion(
  objects: BucketObject[],
  cataloguePaths: Set<string>,
  now: Date,
  maxAgeMs = 24 * 60 * 60 * 1000,
): DeletionPlan {
  const cutoff = now.getTime() - maxAgeMs;
  const remove: BucketObject[] = [];
  const referenced: BucketObject[] = [];
  const tooNew: BucketObject[] = [];

  for (const object of [...objects].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (cataloguePaths.has(object.name)) {
      referenced.push(object);
      continue;
    }
    if (Date.parse(object.createdAt) > cutoff) {
      tooNew.push(object);
      continue;
    }
    remove.push(object);
  }

  return { remove, referenced, tooNew };
}

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

/** The project ref in `https://<ref>.supabase.co`, or null if it is not one. */
export function projectRefFromSupabaseUrl(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }
  const match = /^([a-z0-9]+)\.supabase\.(co|in)$/.exec(host);
  return match ? match[1] : null;
}

/**
 * Whether a target has to be acknowledged with `--live`.
 *
 * Fail-safe by construction: the *only* ref that does not need `--live` is the
 * one `.env.local` names, and `.env.local` names staging. A known production
 * ref always needs it even if the shell has been talked into calling itself
 * staging, and an unrecognised project needs it because nothing here can vouch
 * for it.
 */
export function targetNeedsLiveFlag(
  ref: string,
  stagingRef: string | undefined,
  prodRef: string | undefined,
): boolean {
  if (prodRef !== undefined && ref === prodRef) return true;
  if (stagingRef === undefined) return true;
  return ref !== stagingRef;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** A fixed-width table; the header row is the first entry of `rows`. */
export function formatTable(rows: string[][]): string[] {
  if (rows.length === 0) return [];
  const widths: number[] = [];
  for (const row of rows) {
    for (const [index, cell] of row.entries()) {
      widths[index] = Math.max(widths[index] ?? 0, cell.length);
    }
  }
  return rows.map((row) =>
    row
      .map((cell, index) =>
        index === row.length - 1 ? cell : cell.padEnd(widths[index] ?? 0),
      )
      .join("  ")
      .trimEnd(),
  );
}
