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
 *   5b1–5b5        participations-race.test.ts
 *   5b6–5b7        participations-rls.test.ts
 *   5c1            product-seat-counts-trigger.test.ts
 *   5c2            cancel-participation.test.ts
 *   5c3–5c5        get-my-payment-problem-participations.test.ts
 *   5d1–5da        session-credits-cron.test.ts
 *   5e1–5e4        products-gamer-rls.test.ts
 *   5e5–5e8        products-purchaser-rls.test.ts
 *   5f1, 5ff       update-product.test.ts
 *   5f3            product-translations-trigger.test.ts
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
  /** ISO timestamp; default: 1 minute ago (registration is open). */
  registrationOpensAt?: string;
  /** Default: "UTC" — keeps cron tests free of zone-arithmetic edge cases. */
  timezone?: string;
  waitlistEnabled?: boolean;
  isVisible?: boolean;
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
 * Hard-deletes v2 products by id. CASCADE removes participations,
 * schedule slots, holiday-calendar links, prices, groups, the seat-count
 * rollup row, etc. Use in afterAll.
 */
export async function deleteTestProducts(
  admin: SupabaseClient<Database>,
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) return;
  await admin.from("products").delete().in("id", productIds);
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
