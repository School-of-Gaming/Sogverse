/**
 * Folds every legacy product picture into the `product_images` catalogue, so
 * that no product is left carrying an un-catalogued image_path.
 *
 * ## The window this runs in
 *
 * The catalogue ships in three releases, and this script is the operator step
 * between the first two:
 *
 *   1. **The migration** — `product_images`, `products.image_id`, and a
 *      BEFORE INSERT OR UPDATE trigger on `products` that rewrites
 *      `image_path` from the linked entry. Already live on staging and prod.
 *      The running app is indifferent to it.
 *   2. **This script** — run by hand against staging, then against production
 *      with the owner present, *while the old app is still deployed*.
 *   3. **The app** — the catalogue dialog and the rewritten product routes.
 *
 * The order is not a preference. The new product form loads a product with no
 * entry as `image_id: null` and always writes it back, so shipping the app
 * first would have the trigger blank a legacy picture on that product's first
 * ordinary edit. Running the link pass first means no legacy product exists
 * when the new code ships, and `image_id: null` has exactly one meaning.
 *
 * **The cost of the window, stated plainly.** Between this run and release 3
 * the *old* routes are live against relinked rows. If an admin changes a
 * product image inside the window, the old update route uploads a new object
 * and writes the new path, the trigger immediately rewrites `image_path` back
 * to the linked entry's path, and the route then deletes the object it
 * superseded — which after relinking may be an object other products share. The
 * admin sees their change silently not happen while a picture several products
 * depend on is destroyed. "Do not change product images in this window" is an
 * instruction with teeth. Keep the window short and scheduled.
 *
 * ## Running it
 *
 *   npx tsx scripts/link-product-images.ts --project-ref <ref>              # dry run
 *   npx tsx scripts/link-product-images.ts --project-ref <ref> --apply
 *   npx tsx scripts/link-product-images.ts --project-ref <ref> --backup --out <dir>
 *   npx tsx scripts/link-product-images.ts --project-ref <ref> --delete-legacy --manifest <file>
 *
 * **Dry run by default**; `--apply` writes. The target is named twice and the
 * two must agree: `--project-ref` is required and is checked against the host
 * of the resolved `NEXT_PUBLIC_SUPABASE_URL`. Keys come from `.env.local`
 * except where the shell already set them, so pointing this at production is
 * two assignments plus `--live`:
 *
 *   $env:NEXT_PUBLIC_SUPABASE_URL = "https://<prod-ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "..."
 *   npx tsx scripts/link-product-images.ts --project-ref <prod-ref> --live
 *
 * Any ref that is not the one `.env.local` names needs `--live`, in every mode
 * including the read-only ones — the acknowledgement is about *which project is
 * being read and reported on*, and an unrecognised ref is treated as live
 * because nothing here can vouch for it.
 *
 * **What that guard is and is not.** "The ref `.env.local` names" is read from
 * `SUPABASE_PROJECT_REF` in the environment, which a shell export overrides
 * exactly as it overrides the URL — so someone setting both can silence the
 * flag. That is accepted: naming a project as your trusted one in the same
 * breath as pointing the script at it is no weaker than typing `--live`, which
 * is the very acknowledgement being skipped. The guard that does not bend is
 * `SUPABASE_PROD_PROJECT_REF`, which is set in `.env.local`: production is
 * recognised by name whatever `SUPABASE_PROJECT_REF` has been talked into
 * saying, the banner reads `*** PRODUCTION ***`, and `--live` is required
 * unconditionally.
 *
 * ## The three modes
 *
 * **Link pass** (the default). For each distinct `products.image_path` that has
 * no `product_images` row: download the object, sha256 it, copy the bytes to
 * `<sha256>.<ext>` (`upsert: false`, one-year cache control — an "already
 * exists" answer is success, because the name *is* the bytes), insert the row
 * labelled after the earliest-created product using it, and set `image_id` on
 * every product carrying that path. The trigger writes each `image_path`. Two
 * legacy paths holding the same bytes collapse into one row: that is the whole
 * dedup mechanism. Idempotent — a second run finds only catalogue paths and
 * says so.
 *
 * A legacy object that is gone from the bucket is reported, and on `--apply`
 * that product's `image_path` is set to NULL: there is nothing to catalogue and
 * the column was already painting a broken picture. A *catalogue* path whose
 * object is gone is different in kind — it means something deleted an object
 * several products may share — so the run refuses outright rather than
 * repairing around it.
 *
 * **`--backup`** downloads every object in the bucket to a dated folder outside
 * the repo, then re-reads each written file from disk and checks both its
 * length and its **sha256** against the bytes that were downloaded, aborting
 * loudly on any disagreement. The manifest records name, size and hash. The
 * bucket is the only copy of these pictures, and a `stat` agrees with a
 * truncated write — the hash is what makes "verified" mean anything.
 *
 * **`--delete-legacy`** removes every object no catalogue row references. It
 * refuses without a manifest that still matches the bucket exactly, refuses
 * while any product sits on a non-catalogue path, refuses on a dangling
 * catalogue path, and skips anything uploaded in the last day. It prints what
 * it would remove and, with `--apply`, asks for the project ref to be typed
 * back before it removes anything.
 *
 * That manifest-versus-bucket check is **name and size only**, and cannot be
 * more: the storage listing carries no content hash, so there is nothing to
 * compare the manifest's hashes against on this side. The hashes are checked
 * where they can be — against the files on disk, at `--backup` time — and here
 * their presence is simply what marks a manifest as one a verifying run wrote.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";

import { DEFAULT_LOCALE } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { walkPages } from "@/lib/supabase/paging";
import type { Database } from "@/types";

import {
  backupManifest,
  computeLinkPlan,
  describeAction,
  formatTable,
  looksLikeCataloguePath,
  manifestDiffIsClean,
  normaliseExtension,
  planLegacyDeletion,
  projectRefFromSupabaseUrl,
  targetNeedsLiveFlag,
  verifyManifest,
} from "./lib/product-image-catalogue";
import type {
  BucketObject,
  CatalogueRow,
  ImagedProduct,
  LegacyResolution,
  ManifestObject,
} from "./lib/product-image-catalogue";

const BUCKET = "product-images";

/** Matches the one-year header the product routes already write. */
const CACHE_CONTROL = "31536000";

type Admin = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/**
 * Load `.env.local` without clobbering the shell, exactly as the Stripe
 * backfill script does. Precedence is the point: `.env.local` names staging by
 * construction, so a shell assignment is the only way to name another project
 * deliberately. Returns the keys this call supplied.
 */
function loadEnvLocal(): Set<string> {
  const suppliedByFile = new Set<string>();
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return suppliedByFile;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (key in process.env) continue;
    process.env[key] = trimmed.slice(eqIndex + 1).trim();
    suppliedByFile.add(key);
  }
  return suppliedByFile;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name} — set it in the shell or in .env.local`);
    process.exit(1);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

type Mode = "link" | "backup" | "delete-legacy";

interface Options {
  mode: Mode;
  projectRef: string;
  apply: boolean;
  live: boolean;
  manifestPath: string | null;
  outDir: string | null;
}

const USAGE = [
  "Usage:",
  "  npx tsx scripts/link-product-images.ts --project-ref <ref> [--apply] [--live]",
  "  npx tsx scripts/link-product-images.ts --project-ref <ref> --backup [--out <dir>]",
  "  npx tsx scripts/link-product-images.ts --project-ref <ref> --delete-legacy --manifest <file> [--apply]",
].join("\n");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv: string[]): Options {
  let projectRef: string | null = null;
  let manifestPath: string | null = null;
  let outDir: string | null = null;
  let apply = false;
  let live = false;
  let backup = false;
  let deleteLegacy = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--apply":
        apply = true;
        break;
      case "--live":
        live = true;
        break;
      case "--backup":
        backup = true;
        break;
      case "--delete-legacy":
        deleteLegacy = true;
        break;
      case "--project-ref":
        projectRef = argv[++i] ?? null;
        break;
      case "--manifest":
        manifestPath = argv[++i] ?? null;
        break;
      case "--out":
        outDir = argv[++i] ?? null;
        break;
      default:
        fail(`Unknown argument: ${arg}\n\n${USAGE}`);
    }
  }

  if (backup && deleteLegacy) {
    fail(`--backup and --delete-legacy are separate runs.\n\n${USAGE}`);
  }
  if (projectRef === null || projectRef === "") {
    fail(
      `--project-ref is required: name the project you mean, so the URL in the environment can be checked against it.\n\n${USAGE}`,
    );
  }

  return {
    mode: backup ? "backup" : deleteLegacy ? "delete-legacy" : "link",
    projectRef,
    apply,
    live,
    manifestPath,
    outDir,
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * Every object in the bucket. Paged at 100 because that is the API's own
 * default page size — asking for more and stopping on a short page would stop
 * at the server's cap instead of at the end of the listing.
 */
async function listBucket(admin: Admin): Promise<BucketObject[]> {
  const objects: BucketObject[] = [];
  const PAGE = 100;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(BUCKET).list("", {
      limit: PAGE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    for (const object of data) {
      // A row with no id and no metadata is a prefix placeholder, not a file.
      // This bucket is flat, so none should appear — skipping them costs
      // nothing and stops a future folder from being counted as an image.
      if (object.id === null || object.metadata === null) continue;
      objects.push({
        name: object.name,
        bytes: object.metadata.size,
        createdAt: object.created_at ?? object.updated_at ?? "",
      });
    }
    if (data.length < PAGE) break;
  }
  return objects;
}

async function downloadObject(admin: Admin, key: string): Promise<Buffer> {
  const { data, error } = await admin.storage.from(BUCKET).download(key);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

function sha256Of(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/** HTTP status behind a storage error, when it carries one. */
function storageErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  if ("status" in error && typeof error.status === "number") return error.status;
  if ("statusCode" in error) {
    const code = error.statusCode;
    if (typeof code === "number") return code;
    if (typeof code === "string" && /^\d+$/.test(code)) return Number(code);
  }
  return null;
}

/**
 * An object already at this key is success, not failure: the key is the sha256
 * of the bytes, so whatever is there is byte-for-byte what we were about to
 * write. This is also why `upsert` stays false — the bytes at a bucket URL are
 * immutable by contract (the image optimizer floors its cache at a year), and
 * an overwrite is the one thing that could break it.
 */
function isAlreadyExists(error: { name: string; message: string }): boolean {
  if (storageErrorStatus(error) === 409) return true;
  if (error.name === "Duplicate") return true;
  return /already exists|duplicate/i.test(error.message);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function loadImagedProducts(admin: Admin): Promise<ImagedProduct[]> {
  const rows = await walkPages("products carrying an image", (from, to) =>
    admin
      .from("products")
      .select(
        "id, created_at, image_path, image_id, product_translations(locale, name)",
        { count: "exact" },
      )
      .not("image_path", "is", null)
      .order("created_at")
      .order("id")
      // Embedded rows come back unordered, so a product with no English
      // translation would otherwise draw its label from an arbitrary locale and
      // the answer would flap between runs.
      .order("locale", { referencedTable: "product_translations" })
      .range(from, to),
  );

  const products: ImagedProduct[] = [];
  for (const row of rows) {
    if (row.image_path === null) continue;
    products.push({
      id: row.id,
      imagePath: row.image_path,
      imageId: row.image_id,
      createdAt: row.created_at,
      name: resolveTranslation(row.product_translations, DEFAULT_LOCALE)?.name ?? null,
    });
  }
  return products;
}

async function loadCatalogue(admin: Admin): Promise<CatalogueRow[]> {
  return walkPages("product_images", (from, to) =>
    admin
      .from("product_images")
      .select("id, sha256, path, label", { count: "exact" })
      .order("created_at")
      .order("id")
      .range(from, to),
  );
}

// ---------------------------------------------------------------------------
// The link pass
// ---------------------------------------------------------------------------

async function runLinkPass(admin: Admin, options: Options): Promise<void> {
  const [products, catalogue, objects] = await Promise.all([
    loadImagedProducts(admin),
    loadCatalogue(admin),
    listBucket(admin),
  ]);

  const objectNames = new Set(objects.map((o) => o.name));
  const cataloguePaths = new Set(catalogue.map((row) => row.path));

  console.log(
    `${products.length} product(s) carry an image_path; ${catalogue.length} catalogue entr(ies); ${objects.length} object(s) in the bucket.`,
  );
  console.log("");

  // Refusal, not repair. A catalogue path with no object means something
  // deleted bytes that any number of products point at, and the fix is to
  // restore them from a backup — not to let a cleanup run rewrite rows on top
  // of the damage.
  const dangling = [...cataloguePaths].filter((p) => !objectNames.has(p)).sort();
  if (dangling.length > 0) {
    console.error(
      `REFUSING: ${dangling.length} catalogue path(s) have no object in the bucket.`,
    );
    for (const p of dangling) console.error(`  ${p}`);
    console.error(
      "A catalogue entry is shared by design, so a missing object is destroyed data, not drift. Restore from a backup before running this again.",
    );
    process.exit(1);
  }

  // Hash every distinct legacy path. Catalogue paths are skipped: their row
  // already names the bytes.
  const legacyPaths = [
    ...new Set(
      products.map((p) => p.imagePath).filter((p) => !cataloguePaths.has(p)),
    ),
  ].sort();

  const unsupported = legacyPaths.filter((p) => normaliseExtension(p) === null);
  if (unsupported.length > 0) {
    console.error(
      `REFUSING: ${unsupported.length} image_path(s) carry an extension outside the accept list.`,
    );
    for (const p of unsupported) console.error(`  ${p}`);
    console.error(
      "Nothing is re-encoded here, so there is no content type to store these under. Resolve them by hand first.",
    );
    process.exit(1);
  }

  const resolutions = new Map<string, LegacyResolution>();
  for (const legacyPath of legacyPaths) {
    if (!objectNames.has(legacyPath)) {
      resolutions.set(legacyPath, { kind: "missing" });
      continue;
    }
    const bytes = await downloadObject(admin, legacyPath);
    const ext = normaliseExtension(legacyPath);
    if (ext === null) continue; // unreachable — refused above
    resolutions.set(legacyPath, {
      kind: "hashed",
      sha256: sha256Of(bytes),
      ext: ext.ext,
    });
  }

  const plan = computeLinkPlan(products, catalogue, resolutions);
  const { summary } = plan;

  const table: string[][] = [["PATH", "PRODUCTS", "SHA256", "ACTION"]];
  for (const pathPlan of plan.paths) {
    const resolution = resolutions.get(pathPlan.path);
    const sha =
      resolution && resolution.kind === "hashed"
        ? `${resolution.sha256.slice(0, 12)}…`
        : pathPlan.isCataloguePath
          ? `${pathPlan.path.slice(0, 12)}…`
          : "—";
    table.push([
      pathPlan.path,
      String(pathPlan.products.length),
      sha,
      describeAction(pathPlan.action),
    ]);
  }
  for (const line of formatTable(table)) console.log(line);
  console.log("");

  if (summary.missingLegacyObjects > 0) {
    console.log(
      `Missing legacy objects (${summary.missingLegacyObjects}) — nothing to catalogue; the column already paints a broken picture:`,
    );
    for (const missing of plan.missing) {
      console.log(`  ${missing.path}`);
      for (const product of missing.products) {
        console.log(`      ${product.id}  ${product.name ?? "(no name)"}`);
      }
    }
    console.log("");
  }

  console.log("Summary");
  console.log(`  products carrying an image_path : ${summary.imagedProducts}`);
  console.log(`  distinct paths                  : ${summary.distinctPaths}`);
  console.log(
    `    already catalogue paths       : ${summary.cataloguePaths}`,
  );
  console.log(`    legacy paths                  : ${summary.legacyPaths}`);
  // Counted over the legacy paths only — a catalogue path's bytes are already
  // named by its row, so it is never hashed and never joins a group. On a
  // finished project this line is 0 and means "nothing left to fold in".
  console.log(
    `  distinct images among those     : ${summary.distinctHashes}`,
  );
  console.log(`  catalogue rows to create        : ${summary.entriesToCreate}`);
  console.log(`  existing rows reused            : ${summary.entriesReused}`);
  console.log(`  products to relink              : ${summary.productsToRelink}`);
  console.log(
    `  missing legacy objects          : ${summary.missingLegacyObjects} (${summary.productsWithMissingObject} product(s))`,
  );
  console.log("");

  if (summary.nothingToDo) {
    console.log(
      "Nothing to do — every image_path is a catalogue path and every product is linked.",
    );
    return;
  }

  if (!options.apply) {
    console.log("Dry run. With --apply this run would:");
    for (const group of plan.groups) {
      if (group.existing === null) {
        console.log(
          `  upload ${group.targetPath} and insert a row labelled "${group.label}" (from ${group.legacyPaths.length} legacy path(s))`,
        );
      } else {
        console.log(
          `  reuse the existing row for ${group.targetPath} ("${group.existing.label}")`,
        );
      }
    }
    const relinked = plan.paths.reduce((n, p) => n + p.toLink.length, 0);
    console.log(
      `  set image_id on ${relinked} product row(s) — the trigger rewrites each image_path`,
    );
    if (summary.missingLegacyObjects > 0) {
      console.log(
        `  set image_path = NULL on ${summary.productsWithMissingObject} product row(s) whose object is gone`,
      );
    }
    console.log("");
    console.log("Re-run with --apply to write it.");
    return;
  }

  // ----- apply -----
  let created = 0;
  let relinked = 0;
  const entryIdByPath = new Map<string, string>();

  for (const group of plan.groups) {
    let entryId = group.existing?.id ?? null;

    if (entryId === null) {
      const source = group.legacyPaths[0];
      // Re-read the bytes rather than carrying every object in memory. The
      // hash is re-checked because the key *is* the hash: writing different
      // bytes under a content-addressed name would break the immutability the
      // one-year optimizer cache rests on.
      const bytes = await downloadObject(admin, source);
      const actual = sha256Of(bytes);
      if (actual !== group.sha256) {
        console.error(
          `REFUSING: ${source} changed between the plan and the write (${group.sha256} -> ${actual}).`,
        );
        process.exit(1);
      }
      const contentType = normaliseExtension(source)?.contentType;
      if (contentType === undefined) {
        console.error(`REFUSING: no content type for ${source}.`);
        process.exit(1);
      }

      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(group.targetPath, bytes, {
          contentType,
          upsert: false,
          cacheControl: CACHE_CONTROL,
        });
      if (uploadError && !isAlreadyExists(uploadError)) throw uploadError;

      const { data: inserted, error: insertError } = await admin
        .from("product_images")
        .insert({
          label: group.label,
          sha256: group.sha256,
          path: group.targetPath,
        })
        .select("id")
        .single();

      if (insertError) {
        // A concurrent run (or a retry after a partial failure) already made
        // the row; the hash is unique, so re-selecting by it is the answer.
        if (insertError.code !== "23505") throw insertError;
        const { data: existing, error: reselectError } = await admin
          .from("product_images")
          .select("id")
          .eq("sha256", group.sha256)
          .single();
        if (reselectError) throw reselectError;
        entryId = existing.id;
        console.log(`row exists  ${group.targetPath}  ${entryId}`);
      } else {
        entryId = inserted.id;
        created += 1;
        console.log(
          `created     ${group.targetPath}  ${entryId}  "${group.label}"`,
        );
      }
    }

    for (const legacyPath of group.legacyPaths) {
      entryIdByPath.set(legacyPath, entryId);
    }
  }

  for (const pathPlan of plan.paths) {
    if (pathPlan.toLink.length === 0) continue;
    const entryId =
      pathPlan.action.kind === "link-only"
        ? pathPlan.action.entryId
        : entryIdByPath.get(pathPlan.path);
    if (entryId === undefined) continue;

    const ids = pathPlan.toLink.map((p) => p.id);
    const { data: updated, error } = await admin
      .from("products")
      .update({ image_id: entryId })
      .in("id", ids)
      .select("id");
    if (error) throw error;
    relinked += updated.length;
    console.log(
      `linked      ${updated.length} product(s) on ${pathPlan.path} -> ${entryId}`,
    );
  }

  let cleared = 0;
  for (const missing of plan.missing) {
    const ids = missing.products.map((p) => p.id);
    const { data: updated, error } = await admin
      .from("products")
      .update({ image_path: null })
      .in("id", ids)
      .select("id");
    if (error) throw error;
    cleared += updated.length;
    console.log(
      `cleared     ${updated.length} product(s) whose object is gone (${missing.path})`,
    );
  }

  console.log("");
  console.log(
    `Applied: ${created} row(s) created, ${relinked} product(s) relinked, ${cleared} image_path(s) cleared.`,
  );

  // Assert the end state rather than assume it — this is the run the app
  // release depends on having succeeded.
  const after = await loadImagedProducts(admin);
  const afterCatalogue = await loadCatalogue(admin);
  const afterPaths = new Set(afterCatalogue.map((row) => row.path));
  const stragglers = after.filter(
    (p) => p.imageId === null || !afterPaths.has(p.imagePath),
  );
  console.log("");
  if (stragglers.length > 0) {
    console.error(
      `INCOMPLETE: ${stragglers.length} product(s) still carry a path outside the catalogue or have no image_id:`,
    );
    for (const p of stragglers) console.error(`  ${p.id}  ${p.imagePath}`);
    process.exitCode = 1;
    return;
  }
  const misshapen = afterCatalogue.filter(
    (row) => !looksLikeCataloguePath(row.path),
  );
  if (misshapen.length > 0) {
    console.error(
      `INCOMPLETE: ${misshapen.length} catalogue row(s) do not have a <sha256>.<ext> path.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Verified: all ${after.length} imaged product(s) are linked, and every image_path is a catalogue path.`,
  );
}

// ---------------------------------------------------------------------------
// Local files
// ---------------------------------------------------------------------------

/**
 * A storage key is an opaque string chosen by whatever wrote it, and `--backup`
 * is the one place one becomes a path on somebody's disk. This bucket is flat
 * and every key in it is a UUID or a hash, so refusing anything that is not a
 * plain flat filename costs nothing and closes the traversal question outright.
 */
function assertPlainFilename(name: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name === "." || name === "..") {
    fail(
      `REFUSING: object key ${JSON.stringify(name)} is not a plain filename and will not be written to disk.`,
    );
  }
}

/* eslint-disable security/detect-non-literal-fs-filename -- every path these five helpers touch is composed in this file from two sources and no others: a directory the operator named on the command line (--out / --manifest) on their own machine, and, for the object files, a storage key that assertPlainFilename has already restricted to [A-Za-z0-9._-]. There is no request input anywhere in this script, so the traversal the rule exists to catch has no way in. */
async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

/**
 * Writes the bytes, then reads the file back off the disk and reports what is
 * actually there — length *and* content hash. A `stat` would agree with a
 * truncated write, a half-flushed buffer or a disk that reported a success it
 * had not performed; only the bytes themselves settle it, and this folder is
 * about to be the sole copy of these pictures.
 */
async function writeAndReadBack(
  file: string,
  bytes: Buffer,
): Promise<{ size: number; sha256: string }> {
  await fsp.writeFile(file, bytes);
  const written = await fsp.readFile(file);
  return { size: written.byteLength, sha256: sha256Of(written) };
}

async function writeText(file: string, text: string): Promise<void> {
  await fsp.writeFile(file, text);
}

function fileExists(file: string): boolean {
  return fs.existsSync(file);
}

async function readText(file: string): Promise<string> {
  return fsp.readFile(file, "utf-8");
}
/* eslint-enable security/detect-non-literal-fs-filename -- back on: the five helpers above are the only filesystem access this script has, and anything added below should be flagged again. */

// ---------------------------------------------------------------------------
// --backup
// ---------------------------------------------------------------------------

/**
 * The dated folder this run writes into.
 *
 * The default base is the OS temp directory rather than the working directory:
 * the working directory is the repository, and a folder of megabytes of PNGs
 * inside a tracked tree is a `git add .` away from being committed. Pass
 * `--out` to put it somewhere you have chosen; anything resolving inside the
 * repository is refused.
 */
function resolveBackupDir(options: Options): string {
  const base = options.outDir ?? os.tmpdir();
  const stamp = formatInTimeZone(
    new Date(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    "yyyy-MM-dd",
  );
  const dir = path.resolve(base, `product-images-backup-${stamp}`);
  const repo = path.resolve(process.cwd());
  const relative = path.relative(repo, dir);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    fail(
      `Refusing to write the backup inside the repository (${dir}). Pass --out with a directory outside the working tree.`,
    );
  }
  return dir;
}

async function runBackup(admin: Admin, options: Options): Promise<void> {
  const dir = resolveBackupDir(options);
  const objects = await listBucket(admin);
  console.log(`Backing up ${objects.length} object(s) to:`);
  console.log(`  ${dir}`);
  console.log("");

  for (const object of objects) assertPlainFilename(object.name);
  await ensureDir(dir);

  const manifest: ManifestObject[] = [];
  const mismatches: string[] = [];
  for (const object of objects) {
    const bytes = await downloadObject(admin, object.name);
    if (bytes.byteLength !== object.bytes) {
      mismatches.push(
        `${object.name}: bucket listing says ${object.bytes} bytes, download gave ${bytes.byteLength}`,
      );
    }
    const digest = sha256Of(bytes);
    const written = await writeAndReadBack(path.join(dir, object.name), bytes);
    if (written.size !== bytes.byteLength) {
      mismatches.push(
        `${object.name}: wrote ${bytes.byteLength} bytes, re-read ${written.size}`,
      );
    }
    if (written.sha256 !== digest) {
      mismatches.push(
        `${object.name}: downloaded bytes hash to ${digest}, the file on disk hashes to ${written.sha256}`,
      );
    }
    manifest.push({ name: object.name, bytes: bytes.byteLength, sha256: digest });
    console.log(
      `  saved ${object.name}  ${bytes.byteLength} bytes  ${digest.slice(0, 12)}…`,
    );
  }

  const manifestPath = path.join(dir, "manifest.json");
  await writeText(
    manifestPath,
    `${JSON.stringify(
      {
        bucket: BUCKET,
        projectRef: options.projectRef,
        generatedAt: new Date().toISOString(),
        objects: manifest,
      },
      null,
      2,
    )}\n`,
  );

  console.log("");
  if (mismatches.length > 0) {
    console.error(
      `BACKUP FAILED — ${mismatches.length} verification failure(s):`,
    );
    for (const line of mismatches) console.error(`  ${line}`);
    console.error(
      "Do not treat this folder as a backup, and do not run --delete-legacy against it.",
    );
    process.exit(1);
  }
  console.log(
    `Backed up ${manifest.length} object(s), ${manifest.reduce((n, o) => n + o.bytes, 0)} bytes total; every file re-read from disk and verified by sha256.`,
  );
  console.log(`Manifest: ${manifestPath}`);
}

// ---------------------------------------------------------------------------
// --delete-legacy
// ---------------------------------------------------------------------------

async function runDeleteLegacy(admin: Admin, options: Options): Promise<void> {
  // Guard 1: a verified backup, named explicitly. Every other guard is about
  // the data being in the right shape; this one is about the bytes existing
  // somewhere else, and it comes first because it is the only one that cannot
  // be re-derived after the fact.
  if (options.manifestPath === null || options.manifestPath === "") {
    fail(
      "REFUSING: --delete-legacy needs --manifest <file> — the manifest written by a --backup run, still matching the bucket. The bucket is the only copy of these pictures.",
    );
  }
  const manifestFile = path.resolve(options.manifestPath);
  if (!fileExists(manifestFile)) {
    fail(`REFUSING: no manifest at ${manifestFile}.`);
  }
  const parsed = backupManifest.safeParse(JSON.parse(await readText(manifestFile)));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.join(".");
    fail(
      [
        `REFUSING: ${manifestFile} is not a backup manifest this script wrote${where === "" ? "" : ` (at ${where})`}: ${issue.message}.`,
        // The shape changed once, and this is the reading it will get: an
        // older manifest recorded name and size only, so it fails on the
        // missing hash. It was never a verified backup by today's meaning —
        // nothing re-read those files — so the answer is a fresh --backup, not
        // a way to accept it.
        "A manifest from before this script recorded content hashes will fail here on a missing 'sha256'. Take a fresh --backup; a size-only manifest never proved the files on disk hold the bucket's bytes.",
      ].join("\n"),
    );
  }
  const manifest = parsed.data;
  if (manifest.projectRef !== options.projectRef) {
    fail(
      `REFUSING: that manifest was taken from project ${manifest.projectRef}, not ${options.projectRef}.`,
    );
  }

  const [objects, catalogue, products] = await Promise.all([
    listBucket(admin),
    loadCatalogue(admin),
    loadImagedProducts(admin),
  ]);

  // Guard 2: the manifest still describes the bucket, in both directions.
  const diff = verifyManifest(manifest.objects, objects);
  if (!manifestDiffIsClean(diff)) {
    console.error("REFUSING: the manifest no longer matches the bucket.");
    for (const name of diff.missingFromBucket) {
      console.error(`  gone since the backup : ${name}`);
    }
    for (const name of diff.missingFromManifest) {
      console.error(`  never backed up       : ${name}`);
    }
    for (const m of diff.sizeMismatch) {
      console.error(
        `  size changed          : ${m.name} (${m.manifestBytes} -> ${m.bucketBytes})`,
      );
    }
    console.error("Take a fresh --backup and re-run.");
    process.exit(1);
  }

  const cataloguePaths = new Set(catalogue.map((row) => row.path));
  const objectNames = new Set(objects.map((o) => o.name));

  // Guard 3: the link pass is actually finished.
  const unlinked = products.filter((p) => !cataloguePaths.has(p.imagePath));
  if (unlinked.length > 0) {
    console.error(
      `REFUSING: ${unlinked.length} product(s) still sit on a path with no catalogue row. Run the link pass first.`,
    );
    for (const p of unlinked) console.error(`  ${p.id}  ${p.imagePath}`);
    process.exit(1);
  }

  // Guard 4: no catalogue row is already pointing at nothing.
  const dangling = [...cataloguePaths].filter((p) => !objectNames.has(p)).sort();
  if (dangling.length > 0) {
    console.error(
      `REFUSING: ${dangling.length} catalogue path(s) have no object in the bucket.`,
    );
    for (const p of dangling) console.error(`  ${p}`);
    process.exit(1);
  }

  const deletion = planLegacyDeletion(objects, cataloguePaths, new Date());

  console.log(
    `${objects.length} object(s) in the bucket: ${deletion.referenced.length} referenced, ${deletion.tooNew.length} newer than 24h (skipped), ${deletion.remove.length} to remove.`,
  );
  console.log("");
  if (deletion.tooNew.length > 0) {
    console.log("Skipped as too new:");
    for (const o of deletion.tooNew) console.log(`  ${o.name}  ${o.createdAt}`);
    console.log("");
  }
  if (deletion.remove.length === 0) {
    console.log("Nothing to remove.");
    return;
  }
  console.log("Will remove:");
  for (const o of deletion.remove) {
    console.log(`  ${o.name}  ${o.bytes} bytes  ${o.createdAt}`);
  }
  console.log("");

  if (!options.apply) {
    console.log(
      "Dry run — every guard passed. Re-run with --apply to remove the objects above (you will be asked to type the project ref).",
    );
    return;
  }

  // Guard 5: the ref, typed back. Deleting the only copy of a picture is not
  // something a shell-history arrow key should be able to do.
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = await rl.question(
    `Type the project ref (${options.projectRef}) to remove ${deletion.remove.length} object(s): `,
  );
  rl.close();
  if (typed.trim() !== options.projectRef) {
    fail("REFUSING: that is not the project ref. Nothing was removed.");
  }

  const names = deletion.remove.map((o) => o.name);
  const CHUNK = 100;
  let removed = 0;
  for (let i = 0; i < names.length; i += CHUNK) {
    const batch = names.slice(i, i + CHUNK);
    const { data, error } = await admin.storage.from(BUCKET).remove(batch);
    if (error) throw error;
    removed += data.length;
  }
  console.log("");
  console.log(`Removed ${removed} object(s).`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const suppliedByEnvFile = loadEnvLocal();

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const urlRef = projectRefFromSupabaseUrl(supabaseUrl);
  if (urlRef === null) {
    fail(
      `NEXT_PUBLIC_SUPABASE_URL (${supabaseUrl}) is not a Supabase project URL, so --project-ref cannot be checked against it.`,
    );
  }
  if (urlRef !== options.projectRef) {
    fail(
      `REFUSING: --project-ref says ${options.projectRef}, but NEXT_PUBLIC_SUPABASE_URL points at ${urlRef}. Name the same project twice or fix the environment.`,
    );
  }

  const needsLive = targetNeedsLiveFlag(
    urlRef,
    process.env.SUPABASE_PROJECT_REF,
    process.env.SUPABASE_PROD_PROJECT_REF,
  );
  const isKnownProd = urlRef === process.env.SUPABASE_PROD_PROJECT_REF;

  const sourceOf = (name: string): string =>
    suppliedByEnvFile.has(name) ? ".env.local" : "shell";

  console.log("");
  console.log(
    `Project:  ${urlRef}${isKnownProd ? "  *** PRODUCTION ***" : needsLive ? "  (not the project .env.local names)" : "  (staging, from .env.local)"}`,
  );
  console.log(
    `Supabase: ${supabaseUrl} (from ${sourceOf("NEXT_PUBLIC_SUPABASE_URL")}), service-role key from ${sourceOf("SUPABASE_SERVICE_ROLE_KEY")}`,
  );
  console.log(`Bucket:   ${BUCKET}`);
  console.log(
    `Mode:     ${options.mode}${options.mode === "backup" ? " — reads only" : options.apply ? " — APPLY, will write" : " — dry run, writes nothing"}`,
  );
  console.log("");

  if (needsLive && !options.live) {
    fail(
      `REFUSING: ${urlRef} is not the project .env.local names, so it is treated as live. Re-run with --live once you have read the banner above.`,
    );
  }

  const admin = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  switch (options.mode) {
    case "link":
      await runLinkPass(admin, options);
      return;
    case "backup":
      await runBackup(admin, options);
      return;
    case "delete-legacy":
      await runDeleteLegacy(admin, options);
      return;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  // `process.exitCode` rather than `process.exit()`: forcing an exit while the
  // Supabase HTTP handles are still closing aborts the Node process with a
  // libuv assertion on Windows, which loses the very status this line sets.
  process.exitCode = 1;
});
