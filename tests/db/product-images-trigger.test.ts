import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";

/**
 * Coverage for the product image catalogue's schema half (migration 00196):
 * the `product_images` table, the `products.image_id` FK, and the
 * BEFORE INSERT OR UPDATE trigger that derives `products.image_path` from the
 * linked entry.
 *
 * The single claim this file exists to prove is that **`image_path` cannot
 * disagree with `image_id`**. Everything downstream — every shop card, the
 * detail hero, og:image, the pictures in transactional mail — keeps reading
 * `image_path` and knows nothing about the catalogue, so if that column can
 * drift from the link, the whole design is decorative.
 *
 * Four of the cases are the ordinary lifecycle (link, relink, unlink, and the
 * entry being deleted out from under a product). Two are the ones worth naming:
 *
 *   - **The FK's `SET NULL` fires the trigger.** A referential action is an
 *     ordinary UPDATE on the referencing table, so the trigger runs and blanks
 *     the path. That is load-bearing rather than incidental — "remove from
 *     catalogue" is implemented as a row delete and nothing else — and it is
 *     the kind of fact that is easier to assert than to argue about.
 *   - **An `update_product` call carrying a stale `p_image_path` is inert.**
 *     The RPC assigns `image_path` on every call and this migration does not
 *     touch it; the trigger's lack of a column list is what makes that
 *     assignment lose. If someone ever "tidies" the trigger by adding
 *     `UPDATE OF image_id`, this is the test that fails.
 *
 * And one case in the other direction: a product with **no** entry keeps
 * whatever `image_path` it carries. Every product in production is in that
 * state today, so the trigger not touching them is what makes this migration
 * safe to release on its own, ahead of any code.
 */

const LINKED_PRODUCT = "00000000-0000-0000-0000-000000000630";
const RPC_PRODUCT = "00000000-0000-0000-0000-000000000631";
const LEGACY_PRODUCT = "00000000-0000-0000-0000-000000000632";

const ENTRY_A = "00000000-0000-0000-0000-000000000633";
const ENTRY_B = "00000000-0000-0000-0000-000000000634";
const ENTRY_DOOMED = "00000000-0000-0000-0000-000000000635";
const ENTRY_RPC = "00000000-0000-0000-0000-000000000636";

const PRODUCTS = [LINKED_PRODUCT, RPC_PRODUCT, LEGACY_PRODUCT];
const ENTRIES = [ENTRY_A, ENTRY_B, ENTRY_DOOMED, ENTRY_RPC];

/**
 * Catalogue fixtures. `sha256` and `path` are both UNIQUE table-wide, so these
 * values are shaped to be impossible for anything else to hold: a real hash is
 * 64 hex characters, and none of these is.
 */
const ENTRY_ROWS = [
  { id: ENTRY_A, label: "Trigger fixture A", sha256: "fixture-a", path: "fixture-a.png" },
  { id: ENTRY_B, label: "Trigger fixture B", sha256: "fixture-b", path: "fixture-b.png" },
  { id: ENTRY_DOOMED, label: "Trigger fixture doomed", sha256: "fixture-doomed", path: "fixture-doomed.png" },
  { id: ENTRY_RPC, label: "Trigger fixture rpc", sha256: "fixture-rpc", path: "fixture-rpc.png" },
];

describe("product_images and the image_path trigger", () => {
  /** Service-role client — bypasses RLS, used to seed and to read back. */
  let admin: SupabaseClient<Database>;
  /**
   * A signed-in admin. Needed for the RPC case (`update_product`'s guard reads
   * the caller's live role, and a service-role connection has no profiles row)
   * and for the RLS case, where the point is precisely that a policy is being
   * consulted.
   */
  let adminAuth: SupabaseClient<Database>;
  /** A signed-in customer — the sharp non-admin for the read-side RLS case. */
  let customerAuth: SupabaseClient<Database>;

  async function seedEntries(): Promise<void> {
    await admin.from("product_images").delete().in("id", ENTRIES);
    const { error } = await admin.from("product_images").insert(ENTRY_ROWS);
    if (error) throw new Error(`seedEntries failed: ${error.message}`);
  }

  /** The pair the assertions are about, read back with RLS out of the way. */
  async function imageStateOf(
    productId: string,
  ): Promise<{ image_id: string | null; image_path: string | null }> {
    const { data, error } = await admin
      .from("products")
      .select("image_id, image_path")
      .eq("id", productId)
      .single();
    if (error) throw new Error(`imageStateOf failed: ${error.message}`);
    return data;
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    customerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );

    await deleteTestProducts(admin, PRODUCTS);
    await seedEntries();
  });

  afterAll(async () => {
    await deleteTestProducts(admin, PRODUCTS);
    await admin.from("product_images").delete().in("id", ENTRIES);
  });

  describe("the trigger keeps image_path equal to the linked entry's path", () => {
    it("follows a link, a relink and an unlink", async () => {
      await deleteTestProducts(admin, [LINKED_PRODUCT]);
      await createTestProduct(admin, { id: LINKED_PRODUCT });

      // A product with no entry starts wherever it was put — the pre-catalogue
      // state, and the baseline the link has to overwrite.
      await admin
        .from("products")
        .update({ image_path: "legacy/before-the-catalogue.png" })
        .eq("id", LINKED_PRODUCT);
      expect(await imageStateOf(LINKED_PRODUCT)).toEqual({
        image_id: null,
        image_path: "legacy/before-the-catalogue.png",
      });

      await admin
        .from("products")
        .update({ image_id: ENTRY_A })
        .eq("id", LINKED_PRODUCT);
      expect(await imageStateOf(LINKED_PRODUCT)).toEqual({
        image_id: ENTRY_A,
        image_path: "fixture-a.png",
      });

      await admin
        .from("products")
        .update({ image_id: ENTRY_B })
        .eq("id", LINKED_PRODUCT);
      expect(await imageStateOf(LINKED_PRODUCT)).toEqual({
        image_id: ENTRY_B,
        image_path: "fixture-b.png",
      });

      await admin
        .from("products")
        .update({ image_id: null })
        .eq("id", LINKED_PRODUCT);
      expect(await imageStateOf(LINKED_PRODUCT)).toEqual({
        image_id: null,
        image_path: null,
      });
    });

    it("ignores an image_path written alongside a live link", async () => {
      // The direct-write version of the RPC case below: whatever a writer says
      // about image_path, a linked product ends the statement on its entry's
      // path. This is what the trigger's missing column list buys.
      await deleteTestProducts(admin, [LINKED_PRODUCT]);
      await createTestProduct(admin, { id: LINKED_PRODUCT });

      await admin
        .from("products")
        .update({ image_id: ENTRY_A })
        .eq("id", LINKED_PRODUCT);

      await admin
        .from("products")
        .update({ image_path: "someone/else.png" })
        .eq("id", LINKED_PRODUCT);
      expect(await imageStateOf(LINKED_PRODUCT)).toEqual({
        image_id: ENTRY_A,
        image_path: "fixture-a.png",
      });

      // Even a statement that writes both at once, in the wrong order.
      await admin
        .from("products")
        .update({ image_path: "someone/else.png", image_id: ENTRY_B })
        .eq("id", LINKED_PRODUCT);
      expect(await imageStateOf(LINKED_PRODUCT)).toEqual({
        image_id: ENTRY_B,
        image_path: "fixture-b.png",
      });
    });

    it("resolves the path on INSERT, not just UPDATE", async () => {
      await deleteTestProducts(admin, [LEGACY_PRODUCT]);

      const { error } = await admin.from("products").insert({
        id: LEGACY_PRODUCT,
        product_type: "consumer_club",
        billing_mode: "paid",
        topic: "minecraft_java",
        min_age: 8,
        max_age: 18,
        spoken_language_code: "en",
        is_remote: true,
        timezone: "UTC",
        registration_opens_at: new Date(Date.now() - 60_000).toISOString(),
        seat_count: 1,
        waitlist_enabled: true,
        is_visible: false,
        status: "pending",
        created_by: TEST_IDS.ADMIN,
        image_id: ENTRY_A,
        // Deliberately wrong, and deliberately present: the INSERT branch has
        // to overwrite, not merely fill a NULL.
        image_path: "inserted/wrong.png",
      });
      expect(error).toBeNull();

      expect(await imageStateOf(LEGACY_PRODUCT)).toEqual({
        image_id: ENTRY_A,
        image_path: "fixture-a.png",
      });
    });

    it("leaves a product with no entry exactly as it was", async () => {
      // The state every production row is in the moment this migration lands.
      // If the trigger touched these, releasing it ahead of the app would blank
      // ~107 pictures.
      await deleteTestProducts(admin, [LEGACY_PRODUCT]);
      await createTestProduct(admin, { id: LEGACY_PRODUCT });

      await admin
        .from("products")
        .update({ image_path: "legacy/keep-me.png" })
        .eq("id", LEGACY_PRODUCT);

      // An ordinary edit that names neither image column.
      await admin
        .from("products")
        .update({ seat_count: 12 })
        .eq("id", LEGACY_PRODUCT);

      expect(await imageStateOf(LEGACY_PRODUCT)).toEqual({
        image_id: null,
        image_path: "legacy/keep-me.png",
      });

      // And an UPDATE that sets image_id to the NULL it already held is not an
      // unlink — there was never a link to undo.
      await admin
        .from("products")
        .update({ image_id: null })
        .eq("id", LEGACY_PRODUCT);

      expect(await imageStateOf(LEGACY_PRODUCT)).toEqual({
        image_id: null,
        image_path: "legacy/keep-me.png",
      });
    });
  });

  it("nulls image_path when the entry itself is deleted", async () => {
    // The FK is `ON DELETE SET NULL`, and a referential action is an ordinary
    // UPDATE on the referencing table — so it fires the trigger like anything
    // else. "Remove from catalogue" is a row delete and nothing more, so this
    // is the whole of that feature's data path.
    await deleteTestProducts(admin, [LINKED_PRODUCT]);
    await createTestProduct(admin, { id: LINKED_PRODUCT });
    await seedEntries();

    await admin
      .from("products")
      .update({ image_id: ENTRY_DOOMED })
      .eq("id", LINKED_PRODUCT);
    expect(await imageStateOf(LINKED_PRODUCT)).toEqual({
      image_id: ENTRY_DOOMED,
      image_path: "fixture-doomed.png",
    });

    const { error } = await admin
      .from("product_images")
      .delete()
      .eq("id", ENTRY_DOOMED);
    expect(error).toBeNull();

    expect(await imageStateOf(LINKED_PRODUCT)).toEqual({
      image_id: null,
      image_path: null,
    });
  });

  it("keeps a linked product on its entry's path across an update_product call carrying a stale p_image_path", async () => {
    // update_product assigns `image_path = p_image_path` on every call and this
    // migration deliberately did not change it. The product form will keep
    // sending whatever path it loaded, so for a linked product that value is
    // always potentially stale — and has to lose.
    await deleteTestProducts(admin, [RPC_PRODUCT]);
    await seedEntries();
    await createTestProduct(admin, { id: RPC_PRODUCT });
    await admin.from("product_translations").insert({
      product_id: RPC_PRODUCT,
      locale: "en",
      name: "Catalogue trigger fixture",
      short_description: "Seeded by product-images-trigger.test.ts",
    });

    await admin
      .from("products")
      .update({ image_id: ENTRY_RPC })
      .eq("id", RPC_PRODUCT);

    const { error } = await adminAuth.rpc("update_product", {
      p_id: RPC_PRODUCT,
      p_billing_mode: "paid",
      p_translations: [
        {
          locale: "en",
          name: "Catalogue trigger fixture",
          short_description: "Saved with a stale path",
        },
      ],
      p_topic: "minecraft_java",
      p_for_gamers: true,
      p_for_parents: false,
      p_min_age: 8,
      p_max_age: 18,
      p_spoken_language_code: "en",
      p_is_remote: true,
      p_timezone: "UTC",
      p_registration_opens_at: new Date().toISOString(),
      p_seat_count: 5,
      p_image_path: "stale/what-the-form-loaded.png",
    });
    expect(error).toBeNull();

    expect(await imageStateOf(RPC_PRODUCT)).toEqual({
      image_id: ENTRY_RPC,
      image_path: "fixture-rpc.png",
    });
  });

  describe("the table's own guarantees", () => {
    it("refuses a second row with the same sha256", async () => {
      // Not a nicety: this uniqueness IS the dedup mechanism. Uploading the
      // same bytes twice has to resolve to the row that already exists, and
      // the route learns that from this constraint firing.
      await seedEntries();

      const { error } = await admin.from("product_images").insert({
        label: "Same bytes, different name",
        sha256: "fixture-a",
        path: "fixture-a-duplicate.png",
      });

      expect(error?.code).toBe("23505"); // unique_violation
    });

    it("refuses a second row with the same path", async () => {
      await seedEntries();

      const { error } = await admin.from("product_images").insert({
        label: "Same object, different hash",
        sha256: "fixture-a-impostor",
        path: "fixture-a.png",
      });

      expect(error?.code).toBe("23505");
    });

    it("refuses an empty label and one over 120 characters", async () => {
      const empty = await admin
        .from("product_images")
        .insert({ label: "", sha256: "fixture-empty-label", path: "fixture-empty-label.png" });
      expect(empty.error?.code).toBe("23514"); // check_violation

      const tooLong = await admin
        .from("product_images")
        .insert({ label: "x".repeat(121), sha256: "fixture-long-label", path: "fixture-long-label.png" });
      expect(tooLong.error?.code).toBe("23514");
    });

    it("refuses an image_id with no catalogue entry behind it", async () => {
      // Shaped to be impossible rather than merely unlikely: an all-f UUID is
      // not something gen_random_uuid() will hand out.
      await deleteTestProducts(admin, [LEGACY_PRODUCT]);
      await createTestProduct(admin, { id: LEGACY_PRODUCT });

      const { error } = await admin
        .from("products")
        .update({ image_id: "ffffffff-ffff-ffff-ffff-ffffffffffff" })
        .eq("id", LEGACY_PRODUCT);

      expect(error?.code).toBe("23503"); // foreign_key_violation
      expect(await imageStateOf(LEGACY_PRODUCT)).toMatchObject({
        image_id: null,
      });
    });
  });

  describe("RLS", () => {
    it("shows the catalogue to an admin and nothing to a customer", async () => {
      await seedEntries();

      const asAdmin = await adminAuth
        .from("product_images")
        .select("id, label, path")
        .in("id", ENTRIES);
      expect(asAdmin.error).toBeNull();
      expect(asAdmin.data?.map((row) => row.id).sort()).toEqual(
        [...ENTRIES].sort(),
      );

      // Not an error — RLS filters rather than refuses, which is exactly why
      // this has to be asserted as an empty result rather than a thrown one.
      const asCustomer = await customerAuth
        .from("product_images")
        .select("id")
        .in("id", ENTRIES);
      expect(asCustomer.error).toBeNull();
      expect(asCustomer.data).toEqual([]);
    });
  });
});
