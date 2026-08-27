import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { TEST_IDS } from "./constants";

/**
 * Helpers for tests/db/*.test.ts. The v2 products system has no seed
 * fixtures — tests create products inline via these helpers.
 *
 * Stable UUIDs in the 0xxxxxx-...-xxxxxxxx5xx range are reserved for v2
 * test scaffolding. Each test file picks its own product UUID *sub-range*
 * to avoid cross-file collisions when CI parallelizes db tests (vitest
 * runs files in separate workers, so two files sharing a product id race
 * on products_pkey — one file's insert lands between the other's delete
 * and insert → duplicate-key failure).
 *
 * Allocation registry — keep this current when adding a v2 db test. The
 * suffix is the last byte of the UUID (`...0000000005XX`):
 *   5a1–5a3, 5aa   exposed-function-scope.test.ts (5a3 is its product_groups
 *                  id; 5aa is its unlisted-but-published product)
 *   5a4–5a9        write-idor.test.ts (5a4 is the product; 5a5–5a9 are the
 *                  group / zone / calendar / holiday / slot fixtures it seeds)
 *   5b1–5b5        participations-race.test.ts (5b2 is its soft-cap product)
 *   5b6–5b7        participations-rls.test.ts
 *   5b8–5b9        participations-external.test.ts
 *   5c1            product-seat-counts-trigger.test.ts
 *   5c2            cancel-participation.test.ts
 *   5c3–5c6        get-my-participation-subscription-states.test.ts
 *   5c7            waitlist-admin.test.ts (its muni product; see also 5f6)
 *   5c8–5ca        admin-participation-rpcs.test.ts (5ca is its free club)
 *   5d1–5da        session-credits-cron.test.ts
 *   5e1–5e4        products-gamer-rls.test.ts
 *   5e5–5e8        products-purchaser-rls.test.ts
 *   5f1, 5f2, 5f7, 5f8, 5ff
 *                  update-product.test.ts (5f7 is the product its 00171
 *                  waitlist-deletion cases seed participations on, kept apart
 *                  from 5f1 so the wipe-and-replace cases never see them;
 *                  5f8 is the decoy whose queue pins the delete's product
 *                  scoping)
 *   5f3            product-translations-trigger.test.ts
 *   5f4, 5f5       waitlist-self-service.test.ts
 *   5f6            waitlist-admin.test.ts (its FREE consumer_club product, for
 *                  the demote that 00132's type rule wrongly refused; the
 *                  file's muni product is 5c7)
 *
 * The 5xx block has no tidy sub-range left below 5ff, so allocation continues
 * in 6xx (`...0000000006XX`):
 *   601-606        gedu-session-feed.test.ts (three products, three groups)
 *   607-60b        family-product-feed.test.ts (three products 607-609, two
 *                  groups 60a-60b)
 *   610-616        product-audience.test.ts (three products 610-612, one group
 *                  613, and 614-616 for the roster-shape fixtures)
 *   620-628        admin-dashboard.test.ts (six products — 620, 621, 623, 624,
 *                  625, 628 — plus two groups 622/627 and a holiday calendar
 *                  626; one product per dashboard issue so a fixture built for
 *                  one cannot accidentally raise another)
 *   630-636        product-images-trigger.test.ts (three products 630-632, and
 *                  633-636 for the product_images entries it links them to —
 *                  a different table, but kept in the one registry so nobody
 *                  has to hold two allocation schemes in their head)
 *   640-645        admin-product-sessions.test.ts (an in-person product 640
 *                  with two groups 641/642 — two, because the whole point of
 *                  the product-keyed read is that it carries every group at
 *                  once — plus a decoy product 643 with a group 644, which is
 *                  what makes "only this product's groups came back" provable
 *                  rather than merely true. 645 is a `locations` row rather
 *                  than a product: its own venue, because `site_details` is
 *                  keyed by location and shared across products, so writing
 *                  notes on the seeded Test School would race the gedu feed's
 *                  suite in a parallel worker)
 *   650-658        member-flair.test.ts (650 is the club the two marks are
 *                  exercised on, with sister groups 651/652 taught by two
 *                  different gedus — which is what makes every cross-group case
 *                  in that file about the PRODUCT rather than the group; 653 is
 *                  a product neither gedu teaches, with its group 654, so a
 *                  refusal there is the actor half alone; 655-658 are the
 *                  trigger's own product and its three groups, kept apart
 *                  because two of those cases delete rows — 658 is created and
 *                  deleted inside the ON DELETE SET NULL cascade case — and
 *                  neither may disturb a roster another block asserts on)
 *   660-66b        auto-assign-single-group.test.ts (six products 660-664 and
 *                  66a — a free club with one group, one with none, one with
 *                  two, a municipality club with one, a paid camp with one, and
 *                  a seat-capped free club (66a) whose cap can actually be
 *                  reached — plus their six groups 665-669 and 66b. One product
 *                  per row of the matrix, because the thing under test is how
 *                  many groups a product has and no single product can hold
 *                  three answers)
 *   637            write-idor.test.ts's product_images entry. It sits outside
 *                  that file's 5a4-5a9 block because the block was full when
 *                  the catalogue arrived; the file is named twice here rather
 *                  than the id being squeezed in somewhere it would collide.
 *   6ff            family-product-feed.test.ts's must-NOT-exist participation
 *                  id, backing the case that a nonexistent id is refused with
 *                  exactly the message someone else's id gets. Declared here
 *                  precisely because it sits apart from the block above:
 *                  allocate it to a real fixture and that test quietly starts
 *                  pointing at a row that exists, which is the one thing it
 *                  must never do.
 *
 * One file reserves nothing and is listed anyway, so nobody goes looking for
 * its range: **create-product.test.ts**. It is the only file that calls
 * `create_product`, which mints its own id and accepts none, so it has no
 * fixture UUID to collide on — it collects the ids the RPC hands back and
 * deletes those.
 */

export interface ProductOptions {
  id?: string;
  productType?: Database["public"]["Enums"]["product_type"];
  /** Fixed product_topic enum value. Default: "minecraft_java". */
  topic?: Database["public"]["Enums"]["product_topic"];
  billingMode?: Database["public"]["Enums"]["billing_mode"];
  status?: Database["public"]["Enums"]["product_status"];
  /** null = unlimited seats. Default: 1 (small enough for race tests). */
  seatCount?: number | null;
  signupThreshold?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  /**
   * Location FK. Default: null. Required (and must be a country/region/
   * municipality) for online municipality clubs; must be a site for in-person
   * products; must be null for online non-muni products. See the
   * chk_products_*_location constraints + the validate_products_location
   * trigger.
   */
  locationId?: string | null;
  /** ISO timestamp; default: 1 minute ago (registration is open). */
  registrationOpensAt?: string;
  /** Default: "UTC" — keeps cron tests free of zone-arithmetic edge cases. */
  timezone?: string;
  waitlistEnabled?: boolean;
  isVisible?: boolean;
  /**
   * Audience. Defaults to gamers-only, which is what every product was before
   * 00173 and what the whole existing suite assumes.
   *
   * The age range follows `forGamers` rather than being separately settable,
   * because `chk_products_ages_iff_for_gamers` gives it no freedom: 8–18 when
   * there is a gamer audience, both null when there is not. A helper that let a
   * caller set them independently would only ever be used to build a row the
   * database refuses.
   */
  forGamers?: boolean;
  forParents?: boolean;
}

/**
 * Creates a v2 product with sensible defaults: paid consumer_club, 1 seat,
 * status='pending' so create_participation accepts signups, registration
 * already open. Returns the product id.
 *
 * The caller is responsible for deletion (CASCADE handles participations
 * and the seat-count rollup row).
 */
export async function createTestProduct(
  admin: SupabaseClient<Database>,
  options: ProductOptions = {},
): Promise<string> {
  const productId = options.id ?? crypto.randomUUID();
  const forGamers = options.forGamers ?? true;

  const { error } = await admin.from("products").insert({
    id: productId,
    topic: options.topic ?? "minecraft_java",
    product_type: options.productType ?? "consumer_club",
    billing_mode: options.billingMode ?? "paid",
    status: options.status ?? "pending",
    seat_count: options.seatCount === undefined ? 1 : options.seatCount,
    signup_threshold: options.signupThreshold ?? null,
    start_date: options.startDate ?? null,
    end_date: options.endDate ?? null,
    location_id: options.locationId ?? null,
    registration_opens_at:
      options.registrationOpensAt ?? new Date(Date.now() - 60_000).toISOString(),
    timezone: options.timezone ?? "UTC",
    waitlist_enabled: options.waitlistEnabled ?? true,
    is_visible: options.isVisible ?? true,
    is_remote: true,
    for_gamers: forGamers,
    for_parents: options.forParents ?? false,
    min_age: forGamers ? 8 : null,
    max_age: forGamers ? 18 : null,
    spoken_language_code: "en",
    created_by: TEST_IDS.ADMIN,
  });

  if (error) {
    throw new Error(`createTestProduct failed: ${error.message}`);
  }

  return productId;
}

/**
 * Inserts a schedule slot for a v2 product. Used by the cron test to
 * make a session "fall in the lookback window."
 */
export async function createScheduleSlot(
  admin: SupabaseClient<Database>,
  productId: string,
  slot: { weekday: number; startTime: string; durationMinutes?: number },
): Promise<void> {
  const { error } = await admin.from("schedule_slots").insert({
    product_id: productId,
    weekday: slot.weekday,
    start_time: slot.startTime,
    duration_minutes: slot.durationMinutes ?? 60,
  });
  if (error) {
    throw new Error(`createScheduleSlot failed: ${error.message}`);
  }
}

/**
 * Hard-deletes v2 products by id, participations first. Every FK from
 * products cascades, but the AFTER DELETE trigger on participations
 * re-inserts a product_seat_counts row for the product mid-cascade —
 * which violates its FK once the product row is gone and aborts the
 * whole delete. Deleting participations as their own statement lets the
 * trigger run while the product still exists (family_subscriptions
 * cascade from participations, so they go too). Errors throw: a cleanup
 * that silently fails leaves the id occupied, and the next
 * createTestProduct in the same CI run dies on a duplicate key with no
 * hint of why.
 */
export async function deleteTestProducts(
  admin: SupabaseClient<Database>,
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) return;
  const participations = await admin
    .from("participations")
    .delete()
    .in("product_id", productIds);
  if (participations.error) {
    throw new Error(
      `deleteTestProducts (participations) failed: ${participations.error.message}`,
    );
  }
  const products = await admin.from("products").delete().in("id", productIds);
  if (products.error) {
    throw new Error(
      `deleteTestProducts (products) failed: ${products.error.message}`,
    );
  }
}

/**
 * Removes any family_subscriptions rows owned by the seeded test
 * customers. Subscriptions don't cascade from products, so cron/RLS
 * tests that create them must explicitly clean up.
 */
export async function resetFamilySubs(
  admin: SupabaseClient<Database>,
): Promise<void> {
  await admin
    .from("family_subscriptions")
    .delete()
    .in("customer_id", [TEST_IDS.CUSTOMER, TEST_IDS.CUSTOMER_2]);
}
