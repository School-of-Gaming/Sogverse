import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";
import { TEST_IDS } from "./constants";

/**
 * Migration 00024 adds three NOT-NULL columns on products (is_remote,
 * location_id, spoken_language_code) plus a CHECK enforcing remote XOR
 * location and a trigger enforcing that location_id points at a site.
 *
 * These tests lock those constraints in — if a future migration ever
 * relaxes them, the tests fail and whoever touched them must consciously
 * update this file.
 */

const TEST_PRODUCT_ID = "00000000-0000-0000-0000-000000000220";

function baseProduct() {
  return {
    id: TEST_PRODUCT_ID,
    name: "Constraint Test Product",
    description: "For testing products_location_xor_remote + leaf trigger",
    image_url: "https://example.com/constraint.png",
    is_visible: false,
    created_by: TEST_IDS.ADMIN,
    game_id: TEST_IDS.GAME,
    day_of_week: 2,
    start_time: "16:00",
    timezone: "Europe/Helsinki",
    duration_minutes: 60,
    min_age: 7,
    max_age: 12,
    token_cost: 1,
    spoken_language_code: "en",
  };
}

describe("products location + spoken language constraints", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  afterEach(async () => {
    await admin.from("products").delete().eq("id", TEST_PRODUCT_ID);
  });

  it("accepts a remote product with no location_id", async () => {
    const { error } = await admin.from("products").insert({
      ...baseProduct(),
      is_remote: true,
      location_id: null,
    });

    expect(error).toBeNull();
  });

  it("accepts an in-person product whose location_id is a site", async () => {
    const { error } = await admin.from("products").insert({
      ...baseProduct(),
      is_remote: false,
      location_id: TEST_IDS.LOCATION_SITE,
    });

    expect(error).toBeNull();
  });

  it("rejects is_remote=false with a null location_id (CHECK)", async () => {
    const { error } = await admin.from("products").insert({
      ...baseProduct(),
      is_remote: false,
      location_id: null,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/products_location_xor_remote/);
  });

  it("rejects is_remote=true with a non-null location_id (CHECK)", async () => {
    const { error } = await admin.from("products").insert({
      ...baseProduct(),
      is_remote: true,
      location_id: TEST_IDS.LOCATION_SITE,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/products_location_xor_remote/);
  });

  it("rejects a location_id that points at a non-site row (trigger)", async () => {
    // Trying to attach a product to a region instead of drilling down to a site
    const { error } = await admin.from("products").insert({
      ...baseProduct(),
      is_remote: false,
      location_id: TEST_IDS.LOCATION_REGION,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/must be a site/i);
  });

  it("rejects inserts omitting spoken_language_code (NOT NULL)", async () => {
    // Intentionally omit spoken_language_code — should fail NOT NULL.
    const { spoken_language_code: _drop, ...rest } = baseProduct();
    const { error } = await admin
      .from("products")
      // @ts-expect-error -- intentionally omitting a required field to assert NOT NULL
      .insert({
        ...rest,
        is_remote: true,
        location_id: null,
      });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/spoken_language_code/);
  });
});
