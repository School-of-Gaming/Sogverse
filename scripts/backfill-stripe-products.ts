/**
 * Brings the Stripe Products we own back in line with the Sogverse rows they
 * describe — name, tax code and the managed metadata keys.
 *
 * Re-runnable, and **report-only unless told otherwise**:
 *
 *   npx tsx scripts/backfill-stripe-products.ts            # report, writes nothing
 *   npx tsx scripts/backfill-stripe-products.ts --apply    # writes the diffs it reports
 *
 * ## Where the keys come from
 *
 * `.env.local`, parsed here rather than through Next.js — but **only for keys
 * the shell has not already set**, which is how one script runs against two
 * accounts. `.env.local` holds the test-mode Stripe key and the staging
 * Supabase project, so a bare invocation is the test run. A live run names its
 * three keys in the shell first, and they win:
 *
 *   $env:STRIPE_SECRET_KEY = "rk_live_..."
 *   $env:NEXT_PUBLIC_SUPABASE_URL = "https://<prod-ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "..."
 *   npx tsx scripts/backfill-stripe-products.ts
 *   npx tsx scripts/backfill-stripe-products.ts --apply --live
 *
 * A live *write* needs `--live` alongside `--apply`, and the pairing is checked
 * rather than merely acknowledged. The two keys are set independently, so the
 * mistake this guards is the plausible one: a live Stripe key still paired with
 * the staging database, which would stamp staging names and metadata onto real
 * catalogue entries. A live `--apply` therefore refuses outright when
 * `NEXT_PUBLIC_SUPABASE_URL` came from `.env.local` rather than the shell — the
 * shell is the only way to name a database deliberately, and `.env.local` names
 * staging by construction. The banner printed before any work labels each side
 * with where its value came from, so the pairing is checkable by eye in report
 * mode too, where nothing is refused.
 *
 * A restricted live key needs Products read **and** write granted before
 * `--apply` will get anywhere; report mode needs read alone.
 *
 * ## Why it is a script and not a route
 *
 * `src/lib/stripe/client.ts` is `server-only` and binds its key at import, so
 * it cannot be imported here and cannot be pointed at a second account anyway.
 * The reconcile in `src/lib/stripe/participation-prices.ts` is likewise
 * unreachable, so the desired-shape and diff logic below deliberately mirrors
 * it — semantics included: names resolve at the default locale, a null date is
 * an absent metadata key, an absent key is written as `""`, and nothing that
 * already matches is written at all. The one thing that is **imported rather
 * than mirrored** is the VAT table (`@/lib/stripe/vat`), because a second copy
 * of the tax codes is the one divergence that costs money.
 *
 * ## What it touches, and what it leaves alone
 *
 * Ours is a Stripe Product carrying `metadata.product_id`. Everything else is
 * skipped untouched — including the throwaway per-checkout products Stripe
 * minted for past camp sales, whose sales are closed and whose invoices already
 * record the tax that was applied.
 *
 * It never *creates* a Stripe Product. Camps and events have none until their
 * first purchase mints one, so this script does nothing for the camp VAT path —
 * that is the code change's job. What it is uniquely good for is consumer
 * clubs, which only revisit their Stripe Product on a first sale or a price
 * change and can otherwise drift indefinitely.
 *
 * Either mode exits non-zero if any product we own is left carrying **no tax
 * code** — that is the claim the finance audit procedure in `docs/stripe.md`
 * rests on, and it is meant to be checkable rather than assumed. Report mode
 * checks every owned product; `--apply` re-checks whatever it did not manage to
 * bring into line (a failed write, a skipped duplicate, an orphan, a row it
 * could not derive a shape from), so an apply run cannot exit 0 with the audit's
 * foundational claim unverified. Ordinary drift, and a `product_id` pointing at
 * a row that no longer exists, are reported and exit 0: the first is what
 * `--apply` is for, and the second this script cannot fix.
 *
 * Duplicates are the one thing `--apply` steps around. Two Stripe Products
 * claiming one Sogverse product are reported but never written to, because
 * normalising both copies would make them identical and rob the human deciding
 * which to keep of the evidence for deciding.
 */

import fs from "fs";
import path from "path";

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_LOCALE } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { vatForProductType } from "@/lib/stripe/vat";
import type { Database, ProductType } from "@/types";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/**
 * Load `.env.local` without clobbering the shell. Precedence is the whole point
 * (see the header): whatever is already exported wins, so pointing the script at
 * the live account is three assignments rather than an edited file.
 *
 * Returns the keys this call supplied — i.e. the ones the shell did *not* set.
 * Which side a value came from is not cosmetic: `.env.local` names the staging
 * database by construction, so "the Supabase URL came from the file" is the
 * signal that a live write is aimed at the wrong account.
 */
function loadEnvLocal(): Set<string> {
  const suppliedByFile = new Set<string>();
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return suppliedByFile;
  const envFile = fs.readFileSync(envPath, "utf-8");
  for (const line of envFile.split("\n")) {
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
// Desired shape — mirrors the reconcile in src/lib/stripe/participation-prices.ts
// ---------------------------------------------------------------------------

/** The Stripe Product metadata keys the app owns, and therefore all this may rewrite. */
const MANAGED_PRODUCT_METADATA_KEYS = [
  "product_id",
  "spoken_language_code",
  "delivery_start",
  "delivery_end",
] as const;

type ManagedMetadataKey = (typeof MANAGED_PRODUCT_METADATA_KEYS)[number];

/**
 * One managed key's value, or `""` when absent — which is also how Stripe spells
 * "remove this key" on an update, so both sides of the diff compare as plain
 * strings.
 */
function managedMetadataValue(
  metadata: Record<string, string>,
  key: ManagedMetadataKey,
): string {
  return key in metadata ? metadata[key] : "";
}

interface ProductRow {
  id: string;
  product_type: ProductType;
  spoken_language_code: string;
  /** Bare `date` columns, already `YYYY-MM-DD` and UTC-pinned — they travel verbatim. */
  start_date: string | null;
  end_date: string | null;
  product_translations: { locale: string; name: string }[] | null;
}

interface DesiredStripeProduct {
  name: string;
  tax_code: string;
  metadata: Record<string, string>;
}

/** What the Stripe Product should say, given the Sogverse row. */
function desiredStripeProduct(product: ProductRow): DesiredStripeProduct {
  // One Stripe Product per Sogverse product, shared across every locale, so
  // there is no viewer locale to prefer: resolve at the default locale and walk
  // the shared fallback chain (en → first). The select below orders the embedded
  // translations by locale, which is what makes that last step deterministic.
  const name = resolveTranslation(
    product.product_translations,
    DEFAULT_LOCALE,
  )?.name;
  if (!name) {
    throw new Error(
      `Product ${product.id} has no translation to name its Stripe Product with`,
    );
  }

  const metadata: Record<string, string> = {
    product_id: product.id,
    spoken_language_code: product.spoken_language_code,
  };
  // A null date is an absent key rather than an empty one.
  if (product.start_date) metadata.delivery_start = product.start_date;
  if (product.end_date) metadata.delivery_end = product.end_date;

  return {
    name,
    tax_code: vatForProductType(product.product_type).taxCode,
    metadata,
  };
}

/** `tax_code` is expandable, so it arrives as an id or as the object. */
function taxCodeOf(product: Stripe.Product): string | null {
  const taxCode = product.tax_code;
  if (typeof taxCode === "string") return taxCode;
  return taxCode?.id ?? null;
}

interface FieldDiff {
  field: string;
  have: string;
  want: string;
}

/**
 * The update Stripe would need, and the human-readable diff behind it. An empty
 * `update` means the product already matches and no request is issued —
 * the same "no write when nothing differs" the in-app reconcile promises.
 */
function planUpdate(
  existing: Stripe.Product,
  desired: DesiredStripeProduct,
): { update: Stripe.ProductUpdateParams; diffs: FieldDiff[] } {
  const update: Stripe.ProductUpdateParams = {};
  const diffs: FieldDiff[] = [];

  if (existing.name !== desired.name) {
    update.name = desired.name;
    diffs.push({ field: "name", have: existing.name, want: desired.name });
  }

  const haveTaxCode = taxCodeOf(existing);
  if (haveTaxCode !== desired.tax_code) {
    update.tax_code = desired.tax_code;
    diffs.push({
      field: "tax_code",
      have: haveTaxCode ?? "(none)",
      want: desired.tax_code,
    });
  }

  const metadata: Record<string, string> = {};
  for (const key of MANAGED_PRODUCT_METADATA_KEYS) {
    // Stripe expresses metadata *removal* as writing an empty string; omitting a
    // key means "leave it alone". So a product that loses its end date has to
    // send `delivery_end: ""`, not nothing.
    const want = managedMetadataValue(desired.metadata, key);
    const have = managedMetadataValue(existing.metadata, key);
    if (have !== want) {
      metadata[key] = want;
      diffs.push({
        field: `metadata.${key}`,
        have: have === "" ? "(absent)" : have,
        want: want === "" ? "(remove)" : want,
      });
    }
  }
  if (Object.keys(metadata).length > 0) update.metadata = metadata;

  return { update, diffs };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every Stripe Product on the account, active and inactive alike. */
async function listAllStripeProducts(
  stripe: Stripe,
): Promise<Stripe.Product[]> {
  const products: Stripe.Product[] = [];
  for await (const product of stripe.products.list({ limit: 100 })) {
    products.push(product);
  }
  return products;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The Sogverse rows for the ids Stripe claims. Read in chunks so each request is
 * bounded by construction — at most one row per key — rather than relying on a
 * list read staying under PostgREST's silent row cap.
 */
async function loadProductRows(
  admin: SupabaseClient<Database>,
  ids: string[],
): Promise<Map<string, ProductRow>> {
  const rows = new Map<string, ProductRow>();
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("products")
      .select(
        "id, product_type, spoken_language_code, start_date, end_date, product_translations(locale, name)",
      )
      .in("id", chunk)
      // Embedded resources come back unordered, so a product without an English
      // translation would resolve its name from an arbitrary row and the name
      // would flap between runs. Ordering an embedded resource needs its table
      // named — a bare `.order("locale")` orders `products` by a column it does
      // not have.
      .order("locale", { referencedTable: "product_translations" });
    if (error) throw error;
    for (const row of data) rows.set(row.id, row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

interface OwnedProduct {
  stripeProduct: Stripe.Product;
  sogverseProductId: string;
}

function describe(product: Stripe.Product): string {
  const state = product.active ? "active" : "inactive";
  return `${product.id}  ${state}  "${product.name}"`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => !["--apply", "--live"].includes(a));
  if (unknown.length > 0) {
    console.error(`Unknown argument(s): ${unknown.join(", ")}`);
    console.error(
      "Usage: npx tsx scripts/backfill-stripe-products.ts [--apply [--live]]",
    );
    process.exit(1);
  }
  const apply = args.includes("--apply");
  const liveAcknowledged = args.includes("--live");

  const suppliedByEnvFile = loadEnvLocal();
  const stripeKey = requireEnv("STRIPE_SECRET_KEY");
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const sourceOf = (name: string): string =>
    suppliedByEnvFile.has(name) ? ".env.local" : "shell";

  // A live key is `sk_live_` / `rk_live_`; anything else is test mode.
  const isLiveKey = /^[a-z]k_live_/.test(stripeKey);

  console.log("");
  console.log(
    `Stripe:   ${isLiveKey ? "LIVE MODE" : "test mode"} (${stripeKey.slice(0, 8)}…, from ${sourceOf("STRIPE_SECRET_KEY")})`,
  );
  console.log(
    `Supabase: ${supabaseUrl} (from ${sourceOf("NEXT_PUBLIC_SUPABASE_URL")})`,
  );
  console.log(
    `Mode:     ${apply ? "APPLY — will write to Stripe" : "report only — writes nothing"}`,
  );
  console.log("");

  if (apply && isLiveKey && !liveAcknowledged) {
    console.error(
      "Refusing to write to the LIVE Stripe account without --live. Check the Supabase URL above is the production project first.",
    );
    process.exit(1);
  }

  // `--live` says the pairing was checked; this checks it. `.env.local` holds
  // the staging project and nothing else, so a live key reading its database
  // URL from that file is the exact mismatch --live is meant to have ruled out —
  // and it is caught here, before either client is constructed.
  if (apply && isLiveKey && suppliedByEnvFile.has("NEXT_PUBLIC_SUPABASE_URL")) {
    console.error(
      "Refusing a LIVE write against the Supabase project from .env.local — that is the staging database, and writing to Stripe from it would stamp staging names onto real catalogue entries.",
    );
    console.error(
      "Name the production project in the shell (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) and re-run.",
    );
    process.exit(1);
  }

  const stripe = new Stripe(stripeKey, {
    // Restated rather than imported: `src/lib/stripe/client.ts` is `server-only`.
    // The SDK types the option to the one version they describe, so the compiler
    // catches this drifting from the app's pin on an SDK upgrade.
    apiVersion: "2025-02-24.acacia",
  });
  const admin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const allProducts = await listAllStripeProducts(stripe);

  const owned: OwnedProduct[] = [];
  const notOurs: Stripe.Product[] = [];
  const malformedId: Stripe.Product[] = [];
  for (const product of allProducts) {
    if (!("product_id" in product.metadata)) {
      notOurs.push(product);
      continue;
    }
    const sogverseProductId = product.metadata.product_id;
    if (!UUID_RE.test(sogverseProductId)) {
      malformedId.push(product);
      continue;
    }
    owned.push({ stripeProduct: product, sogverseProductId });
  }

  const rows = await loadProductRows(admin, [
    ...new Set(owned.map((o) => o.sogverseProductId)),
  ]);

  // Two Stripe Products claiming one Sogverse product. The app's search-then-
  // create is eventually consistent, so concurrent first purchases could both
  // miss and both create — the deterministic idempotency key now closes that
  // window, but anything minted before it cannot be un-minted here. Reported
  // rather than resolved: which duplicate to keep depends on which one prices
  // and subscriptions already reference, and that is a human call.
  const byProductId = new Map<string, OwnedProduct[]>();
  for (const entry of owned) {
    const siblings = byProductId.get(entry.sogverseProductId) ?? [];
    siblings.push(entry);
    byProductId.set(entry.sogverseProductId, siblings);
  }
  const duplicated = [...byProductId.entries()].filter(
    ([, entries]) => entries.length > 1,
  );
  const duplicatedIds = new Set(
    duplicated.map(([sogverseProductId]) => sogverseProductId),
  );

  const inSync: OwnedProduct[] = [];
  const drifted: {
    owned: OwnedProduct;
    diffs: FieldDiff[];
    update: Stripe.ProductUpdateParams;
  }[] = [];
  const orphaned: OwnedProduct[] = [];
  const undescribable: { owned: OwnedProduct; message: string }[] = [];
  const noTaxCode: OwnedProduct[] = [];

  for (const entry of owned.sort((a, b) =>
    a.stripeProduct.name.localeCompare(b.stripeProduct.name),
  )) {
    if (taxCodeOf(entry.stripeProduct) === null) noTaxCode.push(entry);

    const row = rows.get(entry.sogverseProductId);
    if (!row) {
      orphaned.push(entry);
      continue;
    }
    // A row with no translations cannot name a Stripe Product, and the
    // derivation says so by throwing. A database trigger makes that near
    // unreachable, but this is a diagnostic tool: one unnameable row must cost
    // its own line in the report, not the rest of the scan — and in `--apply`,
    // not the rest of the writes.
    let desired: DesiredStripeProduct;
    try {
      desired = desiredStripeProduct(row);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      undescribable.push({ owned: entry, message });
      continue;
    }
    const { update, diffs } = planUpdate(entry.stripeProduct, desired);
    if (diffs.length === 0) inSync.push(entry);
    else drifted.push({ owned: entry, diffs, update });
  }

  console.log(`Scanned ${allProducts.length} Stripe products.`);
  console.log(`  ${owned.length} ours (metadata.product_id)`);
  console.log(`  ${notOurs.length} not ours — left alone`);
  if (malformedId.length > 0) {
    console.log(
      `  ${malformedId.length} with a non-UUID product_id — left alone`,
    );
  }
  console.log("");

  if (inSync.length > 0) {
    console.log(`In sync (${inSync.length}) — nothing to write:`);
    for (const entry of inSync)
      console.log(`  ${describe(entry.stripeProduct)}`);
    console.log("");
  }

  if (drifted.length > 0) {
    console.log(`Out of sync (${drifted.length}):`);
    for (const { owned: entry, diffs } of drifted) {
      console.log(`  ${describe(entry.stripeProduct)}`);
      for (const diff of diffs) {
        console.log(`      ${diff.field}: ${diff.have}  ->  ${diff.want}`);
      }
    }
    console.log("");
  }

  if (orphaned.length > 0) {
    console.log(
      `No Sogverse row (${orphaned.length}) — cannot be reconciled, reported only:`,
    );
    for (const entry of orphaned) {
      console.log(
        `  ${describe(entry.stripeProduct)}  product_id=${entry.sogverseProductId}`,
      );
    }
    console.log("");
  }

  if (undescribable.length > 0) {
    console.log(
      `No desired shape (${undescribable.length}) — cannot be reconciled, reported only:`,
    );
    for (const { owned: entry, message } of undescribable) {
      console.log(`  ${describe(entry.stripeProduct)}`);
      console.log(`      ${message}`);
    }
    console.log("");
  }

  if (malformedId.length > 0) {
    console.log(`Non-UUID product_id (${malformedId.length}) — reported only:`);
    for (const product of malformedId) {
      console.log(
        `  ${describe(product)}  product_id=${product.metadata.product_id}`,
      );
    }
    console.log("");
  }

  if (duplicated.length > 0) {
    console.log(
      `Duplicate Stripe products (${duplicated.length} Sogverse product(s)) — skipped by --apply, resolve by hand first:`,
    );
    for (const [sogverseProductId, entries] of duplicated) {
      console.log(`  product_id=${sogverseProductId}`);
      for (const entry of entries)
        console.log(`      ${describe(entry.stripeProduct)}`);
    }
    console.log(
      "  Normalising both copies would make them identical — pick the one prices and subscriptions reference, then re-run.",
    );
    console.log("");
  }

  // The audit claim in docs/stripe.md — "every product we own carries an
  // explicit tax code" — stated as a check rather than an assumption.
  if (noTaxCode.length > 0) {
    console.log(
      `NO TAX CODE (${noTaxCode.length}) — billed at the account default:`,
    );
    for (const entry of noTaxCode)
      console.log(`  ${describe(entry.stripeProduct)}`);
    console.log("");
  } else {
    console.log("Tax codes: every product we own carries one.");
    console.log("");
  }

  if (!apply) {
    if (drifted.length > 0) {
      console.log(
        "Report only — re-run with --apply to write the diffs above.",
      );
    }
    // Drift is normal and `--apply` fixes it; a missing tax code is the defect
    // the audit procedure depends on not existing, and a row we cannot derive a
    // shape from is a claim we cannot make either way.
    //
    // `process.exitCode` rather than `process.exit()`: forcing an exit while the
    // Stripe and Supabase HTTP handles are still closing aborts the Node process
    // with a libuv assertion on Windows, which loses the very status this line
    // exists to set. Nothing here holds the loop open, so returning exits on its
    // own with this code.
    if (noTaxCode.length > 0 || undescribable.length > 0) process.exitCode = 1;
    return;
  }

  // Duplicates are reported but never written: writing to both copies of a pair
  // normalises them into each other, and the human choosing which to keep needs
  // them told apart.
  const toWrite = drifted.filter(
    ({ owned: entry }) => !duplicatedIds.has(entry.sogverseProductId),
  );
  const skippedAsDuplicate = drifted.length - toWrite.length;
  if (skippedAsDuplicate > 0) {
    console.log(
      `Skipping ${skippedAsDuplicate} drifted product(s) that share a product_id — see the duplicates above.`,
    );
    console.log("");
  }

  // Everything the run leaves in its desired state: already there, or written
  // there below. Whatever is missing from this set is what the audit claim has
  // to be re-checked against.
  const inDesiredState = new Set(inSync.map((entry) => entry.stripeProduct.id));

  let updated = 0;
  const failures: { id: string; message: string }[] = [];
  if (toWrite.length === 0) {
    console.log("Nothing to apply.");
  } else {
    for (const { owned: entry, update } of toWrite) {
      try {
        await stripe.products.update(entry.stripeProduct.id, update);
        updated += 1;
        inDesiredState.add(entry.stripeProduct.id);
        console.log(`updated ${entry.stripeProduct.id}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ id: entry.stripeProduct.id, message });
        console.error(`FAILED  ${entry.stripeProduct.id}: ${message}`);
      }
    }
    console.log("");
    console.log(`Applied ${updated} update(s), ${failures.length} failure(s).`);
  }
  // A row with no derivable shape is unreconcilable in either mode, so it fails
  // the run in either mode — an --apply that silently exited 0 on what report
  // mode exits 1 on would make the two disagree about the same account.
  if (failures.length > 0 || undescribable.length > 0) process.exitCode = 1;

  // The audit claim again, over what this run did *not* fix: a failed write, a
  // skipped duplicate, an orphan, a row with no derivable shape. Applying the
  // desired state always writes a tax code, so anything reached above is
  // covered; anything else still has to be asserted, or an apply run could exit
  // 0 having left the claim in docs/stripe.md untested.
  console.log("");
  const stillNoTaxCode = noTaxCode.filter(
    (entry) => !inDesiredState.has(entry.stripeProduct.id),
  );
  if (stillNoTaxCode.length > 0) {
    console.log(
      `NO TAX CODE after applying (${stillNoTaxCode.length}) — billed at the account default:`,
    );
    for (const entry of stillNoTaxCode) {
      console.log(`  ${describe(entry.stripeProduct)}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Tax codes: every product we own carries one.");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
