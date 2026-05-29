import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { TEST_IDS } from "./constants";

/**
 * Helpers for tests/db/*-v2.test.ts. The v2 products system has no seed
 * fixtures — tests create products inline via these helpers.
 *
 * Stable UUIDs in the 0xxxxxx-...-xxxxxxxx5xx range are reserved for v2
 * test scaffolding (topic + reusable resources). Each test file picks
 * its own product UUID *sub-range* to avoid cross-file collisions when CI
 * parallelizes db tests (vitest runs files in separate workers, so two
 * files sharing a product id race on products_v2_pkey — one file's insert
 * lands between the other's delete and insert → duplicate-key failure).
 *
 * Allocation registry — keep this current when adding a v2 db test. The
 * suffix is the last byte of the UUID (`...0000000005XX`):
 *   5a1            topic (this file, shared by all)
 *   5b1–5b5        participations-race.test.ts
 *   5b6–5b7        participations-rls.test.ts
 *   5c1            product-seat-counts-trigger.test.ts
 *   5d1–5da        session-credits-cron.test.ts
 *   5e1–5e4        products-v2-gamer-rls.test.ts
 *   5e5–5e8        products-v2-purchaser-rls.test.ts
 *   5f1, 5ff       update-product-v2.test.ts
 *   5f3            product-translations-v2-trigger.test.ts
 */

// One topic for every v2 test product. Idempotent on rerun.
const TEST_TOPIC_ID = "00000000-0000-0000-0000-0000000005a1";

export interface V2ProductOptions {
  id?: string;
  productType?: Database["public"]["Enums"]["product_type_v2"];
  billingMode?: Database["public"]["Enums"]["billing_mode_v2"];
  status?: Database["public"]["Enums"]["product_status_v2"];
  /** null = unlimited seats. Default: 1 (small enough for race tests). */
  seatCount?: number | null;
  signupThreshold?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  /** ISO timestamp; default: 1 minute ago (registration is open). */
  registrationOpensAt?: string;
  /** Default: "UTC" — keeps cron tests free of zone-arithmetic edge cases. */
  timezone?: string;
  waitlistEnabled?: boolean;
  isVisible?: boolean;
}

/**
 * Ensures the shared test topic exists. v2 products require a topic FK.
 * Safe to call repeatedly; no-op if the row already exists.
 */
export async function ensureTestTopicV2(
  admin: SupabaseClient<Database>,
): Promise<string> {
  await admin
    .from("topics_v2")
    .upsert(
      { id: TEST_TOPIC_ID, slug: "v2-db-test-topic", kind: "subject" },
      { onConflict: "id" },
    );
  return TEST_TOPIC_ID;
}

/**
 * Creates a v2 product with sensible defaults: paid consumer_club, 1 seat,
 * status='pending' so create_participation_v2 accepts signups, registration
 * already open. Returns the product id.
 *
 * The caller is responsible for deletion (CASCADE handles participations
 * and the seat-count rollup row).
 */
export async function createV2TestProduct(
  admin: SupabaseClient<Database>,
  options: V2ProductOptions = {},
): Promise<string> {
  const topicId = await ensureTestTopicV2(admin);
  const productId = options.id ?? crypto.randomUUID();

  const { error } = await admin.from("products_v2").insert({
    id: productId,
    topic_id: topicId,
    product_type: options.productType ?? "consumer_club",
    billing_mode: options.billingMode ?? "paid",
    status: options.status ?? "pending",
    seat_count: options.seatCount === undefined ? 1 : options.seatCount,
    signup_threshold: options.signupThreshold ?? null,
    start_date: options.startDate ?? null,
    end_date: options.endDate ?? null,
    registration_opens_at:
      options.registrationOpensAt ?? new Date(Date.now() - 60_000).toISOString(),
    timezone: options.timezone ?? "UTC",
    waitlist_enabled: options.waitlistEnabled ?? true,
    is_visible: options.isVisible ?? true,
    is_remote: true,
    min_age: 8,
    max_age: 18,
    spoken_language_code: "en",
    created_by: TEST_IDS.ADMIN,
  });

  if (error) {
    throw new Error(`createV2TestProduct failed: ${error.message}`);
  }

  return productId;
}

/**
 * Inserts a schedule slot for a v2 product. Used by the cron test to
 * make a session "fall in the lookback window."
 */
export async function createV2ScheduleSlot(
  admin: SupabaseClient<Database>,
  productId: string,
  slot: { weekday: number; startTime: string; durationMinutes?: number },
): Promise<void> {
  const { error } = await admin.from("schedule_slots_v2").insert({
    product_id: productId,
    weekday: slot.weekday,
    start_time: slot.startTime,
    duration_minutes: slot.durationMinutes ?? 60,
  });
  if (error) {
    throw new Error(`createV2ScheduleSlot failed: ${error.message}`);
  }
}

/**
 * Hard-deletes v2 products by id. CASCADE removes participations,
 * schedule slots, holiday-calendar links, prices, groups, the seat-count
 * rollup row, etc. Use in afterAll.
 */
export async function deleteV2TestProducts(
  admin: SupabaseClient<Database>,
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) return;
  await admin.from("products_v2").delete().in("id", productIds);
}

/**
 * Removes any family_subscriptions_v2 rows owned by the seeded test
 * customers. Subscriptions don't cascade from products, so cron/RLS
 * tests that create them must explicitly clean up.
 */
export async function resetFamilySubsV2(
  admin: SupabaseClient<Database>,
): Promise<void> {
  await admin
    .from("family_subscriptions_v2")
    .delete()
    .in("customer_id", [TEST_IDS.CUSTOMER, TEST_IDS.CUSTOMER_2]);
}
