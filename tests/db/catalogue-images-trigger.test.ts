import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { CatalogueImageInsert } from "@/types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";

/**
 * Coverage for the image catalogue's schema half — the `catalogue_images`
 * table, the `products.image_id` FK and its trigger, and the
 * invariants the database holds rather than application code.
 *
 * The single claim this file exists to prove is that **`image_path` cannot
 * disagree with `image_id`**. Everything downstream — every shop card, the
 * detail hero, og:image, the pictures in transactional mail — keeps reading
 * `image_path` and knows nothing about the catalogue, so if that column can
 * drift from the link, the whole design is decorative.
 *
 * The claim is total: `image_path` is the linked entry's path when
 * there is a link and NULL when there is not, on INSERT and UPDATE alike, and
 * whatever the statement itself said about the column. There is no exception
 * for an unlinked product carrying a path of its own, and the cases below
 * assert that rather than assuming it.
 *
 * Three of the cases are worth naming:
 *
 *   - **The `image_id` FK's `SET NULL` fires the trigger.** A referential
 *     action is an ordinary UPDATE on the referencing table, so the trigger
 *     runs and blanks the path. That is load-bearing rather than incidental —
 *     "remove from catalogue" is implemented as a row delete and nothing else.
 *   - **`update_product` cannot influence `image_path` at all.** It used to
 *     name the column at all: it takes no image parameter and assigns none,
 *     so the case below saves a linked product
 *     through the RPC and requires its picture to survive untouched.
 *   - **The table CHECKs its own columns.** `sha256` is 64 lowercase hex
 *     characters and `path` is that hash plus a stored extension, so a row
 *     whose key has drifted from the bytes it names cannot be written.
 *
 * **There is deliberately no foreign key on `products.image_path`, so there is
 * no case asserting one.** `products` may have exactly one relationship to
 * `catalogue_images` — a second makes every PostgREST embed between them
 * ambiguous (PGRST201) unless every caller hints it, and the admin product
 * detail query embeds this table. The invariant such a key would enforce is
 * carried by the trigger instead, which is sound because the trigger has no
 * column list: every statement naming `image_path` is overwritten before any
 * constraint could be consulted, with the entry's path for a linked product
 * and with NULL for an unlinked one. The cases below are what prove that, and
 * the schema's end-state block asserts the one-relationship rule when CI builds
 * the database from `migrations/`.
 */

/** A valid catalogue hash: 64 lowercase hex characters, from an 8-char seed. */
const hex = (seed: string): string => seed.repeat(8);

const LINKED_PRODUCT = "00000000-0000-0000-0000-000000000630";
const RPC_PRODUCT = "00000000-0000-0000-0000-000000000631";
const LEGACY_PRODUCT = "00000000-0000-0000-0000-000000000632";

const ENTRY_A = "00000000-0000-0000-0000-000000000633";
const ENTRY_B = "00000000-0000-0000-0000-000000000634";
const ENTRY_DOOMED = "00000000-0000-0000-0000-000000000635";
const ENTRY_RPC = "00000000-0000-0000-0000-000000000636";
/** A Library cover — the purpose a product may not link. */
const ENTRY_WIDE = "00000000-0000-0000-0000-000000000638";
/**
 * A Library cover holding ENTRY_A's exact bytes: the per-purpose dedup case
 * inserts it and removes it. Not in `ENTRIES`, because no other case seeds it.
 */
const ENTRY_A_AS_COVER = "00000000-0000-0000-0000-000000000639";

const PRODUCTS = [LINKED_PRODUCT, RPC_PRODUCT, LEGACY_PRODUCT];
const ENTRIES = [ENTRY_A, ENTRY_B, ENTRY_DOOMED, ENTRY_RPC, ENTRY_WIDE];

/**
 * Catalogue fixtures. `sha256` and `path` are each UNIQUE within a purpose
 * *and* CHECKed for form, so these are real-shaped hashes built from
 * repeating hex words — valid to the constraint, and not something a real
 * file's digest will ever collide with.
 */
const SHA_A = hex("aaaa1111");
const SHA_B = hex("bbbb2222");
const SHA_DOOMED = hex("cccc3333");
const SHA_RPC = hex("dddd4444");
const SHA_WIDE = hex("aaaa6666");

const ENTRY_ROWS: CatalogueImageInsert[] = [
  { id: ENTRY_A, label: "Trigger fixture A", sha256: SHA_A, path: `${SHA_A}.png`, purpose: "product" },
  { id: ENTRY_B, label: "Trigger fixture B", sha256: SHA_B, path: `${SHA_B}.png`, purpose: "product" },
  {
    id: ENTRY_DOOMED,
    label: "Trigger fixture doomed",
    sha256: SHA_DOOMED,
    path: `${SHA_DOOMED}.png`,
    purpose: "product",
  },
  { id: ENTRY_RPC, label: "Trigger fixture rpc", sha256: SHA_RPC, path: `${SHA_RPC}.png`, purpose: "product" },
  {
    id: ENTRY_WIDE,
    label: "Trigger fixture wide",
    sha256: SHA_WIDE,
    path: `${SHA_WIDE}.jpg`,
    purpose: "library_cover",
  },
];

describe("catalogue_images and the image_path trigger", () => {
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
    await admin
      .from("catalogue_images")
      .delete()
      .in("id", [...ENTRIES, ENTRY_A_AS_COVER]);
    const { error } = await admin.from("catalogue_images").insert(ENTRY_ROWS);
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
    await admin
      .from("catalogue_images")
      .delete()
      .in("id", [...ENTRIES, ENTRY_A_AS_COVER]);
  });

  describe("the trigger keeps image_path equal to the linked entry's path", () => {
    it("follows a link, a relink and an unlink", async () => {
      await deleteTestProducts(admin, [LINKED_PRODUCT]);
      await createTestProduct(admin, { id: LINKED_PRODUCT });

      expect(await imageStateOf(LINKED_PRODUCT)).toEqual({
        image_id: null,
        image_path: null,
      });

      await admin
        .from("products")
        .update({ image_id: ENTRY_A })
        .eq("id", LINKED_PRODUCT);
      expect(await imageStateOf(LINKED_PRODUCT)).toEqual({
        image_id: ENTRY_A,
        image_path: `${SHA_A}.png`,
      });

      await admin
        .from("products")
        .update({ image_id: ENTRY_B })
        .eq("id", LINKED_PRODUCT);
      expect(await imageStateOf(LINKED_PRODUCT)).toEqual({
        image_id: ENTRY_B,
        image_path: `${SHA_B}.png`,
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
      // Whatever a writer says about image_path, a linked product ends the
      // statement on its entry's path. This is what the trigger's missing
      // column list buys, and it is the whole of the guarantee — there is no
      // constraint standing behind it.
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
        image_path: `${SHA_A}.png`,
      });

      // Even a statement that writes both at once, in the wrong order.
      await admin
        .from("products")
        .update({ image_path: "someone/else.png", image_id: ENTRY_B })
        .eq("id", LINKED_PRODUCT);
      expect(await imageStateOf(LINKED_PRODUCT)).toEqual({
        image_id: ENTRY_B,
        image_path: `${SHA_B}.png`,
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
        start_date: "2099-01-01",
        registration_opens_at: new Date(Date.now() - 60_000).toISOString(),
        seat_count: 1,
        waitlist_enabled: true,
        is_visible: false,
        created_by: TEST_IDS.ADMIN,
        image_id: ENTRY_A,
        // Deliberately wrong, and deliberately present: the INSERT branch has
        // to overwrite, not merely fill a NULL.
        image_path: "inserted/wrong.png",
      });
      expect(error).toBeNull();

      expect(await imageStateOf(LEGACY_PRODUCT)).toEqual({
        image_id: ENTRY_A,
        image_path: `${SHA_A}.png`,
      });
    });
  });

  describe("a product with no entry has no picture", () => {
    // No exception preserves an app-supplied path for an unlinked product:
    // such a branch would be the only way `image_path` could hold something
    // the catalogue does not name.

    it("blanks a path written to an unlinked product on UPDATE", async () => {
      await deleteTestProducts(admin, [LEGACY_PRODUCT]);
      await createTestProduct(admin, { id: LEGACY_PRODUCT });

      const written = await admin
        .from("products")
        .update({ image_path: "legacy/keep-me.png" })
        .eq("id", LEGACY_PRODUCT);
      // Not an error — the write succeeds and is simply overruled. Nothing
      // refuses a foreign path; the trigger replaces it.
      expect(written.error).toBeNull();
      expect(await imageStateOf(LEGACY_PRODUCT)).toEqual({
        image_id: null,
        image_path: null,
      });

      // And an ordinary edit that names neither image column leaves it NULL.
      await admin
        .from("products")
        .update({ seat_count: 12 })
        .eq("id", LEGACY_PRODUCT);
      expect(await imageStateOf(LEGACY_PRODUCT)).toEqual({
        image_id: null,
        image_path: null,
      });
    });

    it("blanks a path supplied on INSERT with no image_id", async () => {
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
        start_date: "2099-01-01",
        registration_opens_at: new Date(Date.now() - 60_000).toISOString(),
        seat_count: 1,
        waitlist_enabled: true,
        is_visible: false,
        created_by: TEST_IDS.ADMIN,
        image_id: null,
        image_path: "legacy/before-the-catalogue.png",
      });
      expect(error).toBeNull();

      expect(await imageStateOf(LEGACY_PRODUCT)).toEqual({
        image_id: null,
        image_path: null,
      });
    });
  });

  it("nulls image_path when the entry itself is deleted", async () => {
    // The FK on image_id is `ON DELETE SET NULL`, and a referential action is
    // an ordinary UPDATE on the referencing table — so it fires the trigger
    // like anything else. "Remove from catalogue" is a row delete and nothing
    // more, so this is the whole of that feature's data path — and it is the
    // case that proves both columns end up NULL together, which is what makes
    // "no entry" and "no picture" one state rather than two.
    await deleteTestProducts(admin, [LINKED_PRODUCT]);
    await createTestProduct(admin, { id: LINKED_PRODUCT });
    await seedEntries();

    await admin
      .from("products")
      .update({ image_id: ENTRY_DOOMED })
      .eq("id", LINKED_PRODUCT);
    expect(await imageStateOf(LINKED_PRODUCT)).toEqual({
      image_id: ENTRY_DOOMED,
      image_path: `${SHA_DOOMED}.png`,
    });

    const { error } = await admin
      .from("catalogue_images")
      .delete()
      .eq("id", ENTRY_DOOMED);
    expect(error).toBeNull();

    expect(await imageStateOf(LINKED_PRODUCT)).toEqual({
      image_id: null,
      image_path: null,
    });
  });

  it("leaves a linked product's picture untouched across an update_product call", async () => {
    // update_product takes no image parameter and assigns the column nothing,
    // so the RPC has no way to name it at all. A product save
    // that changes everything else therefore cannot move the picture — which is
    // what the admin form relies on, since it sends no image field to the RPC.
    await deleteTestProducts(admin, [RPC_PRODUCT]);
    await seedEntries();
    await createTestProduct(admin, { id: RPC_PRODUCT });
    await admin.from("product_translations").insert({
      product_id: RPC_PRODUCT,
      locale: "en",
      name: "Catalogue trigger fixture",
      short_description: "Seeded by catalogue-images-trigger.test.ts",
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
          short_description: "Saved without touching the picture",
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
      p_start_date: "2099-01-01",
      p_seat_count: 5,
    });
    expect(error).toBeNull();

    expect(await imageStateOf(RPC_PRODUCT)).toEqual({
      image_id: ENTRY_RPC,
      image_path: `${SHA_RPC}.png`,
    });
  });

  describe("the table's own guarantees", () => {
    it("refuses a second row with the same sha256 for the same purpose", async () => {
      // Not a nicety: this uniqueness IS the dedup mechanism. Uploading the
      // same bytes twice for one purpose has to resolve to the row that
      // already exists, and the route learns that from this constraint firing.
      await seedEntries();

      const { error } = await admin.from("catalogue_images").insert({
        label: "Same bytes, different name",
        sha256: SHA_A,
        path: `${SHA_A}.webp`,
        purpose: "product",
      });

      expect(error?.code).toBe("23505"); // unique_violation
    });

    it("admits the same bytes once per purpose", async () => {
      // Each purpose has its own bucket, so the same picture uploaded as a
      // product picture and as a Library cover is two objects under one key
      // in two buckets — and two rows, one per purpose, with the same path.
      await seedEntries();

      const { error } = await admin.from("catalogue_images").insert({
        id: ENTRY_A_AS_COVER,
        label: "Fixture A's bytes, as a cover",
        sha256: SHA_A,
        path: `${SHA_A}.png`,
        purpose: "library_cover",
      });

      expect(error).toBeNull();
      const { data } = await admin
        .from("catalogue_images")
        .select("id, purpose")
        .eq("sha256", SHA_A)
        .order("purpose");
      expect(data).toEqual([
        { id: ENTRY_A, purpose: "product" },
        { id: ENTRY_A_AS_COVER, purpose: "library_cover" },
      ]);

      // And within the cover purpose the bytes are now taken too.
      const again = await admin.from("catalogue_images").insert({
        label: "Fixture A's bytes, a second cover",
        sha256: SHA_A,
        path: `${SHA_A}.png`,
        purpose: "library_cover",
      });
      expect(again.error?.code).toBe("23505"); // unique_violation

      await admin.from("catalogue_images").delete().eq("id", ENTRY_A_AS_COVER);
    });

    it("refuses a second row on an existing path by its CHECK rather than by uniqueness", async () => {
      await seedEntries();

      // A path can only ever be its own sha256 plus an extension, so "the
      // same path under a different hash" is refused by the CHECK (23514)
      // before uniqueness is consulted — and the same path under the same
      // hash and purpose is the duplicate-sha256 case above. The per-purpose
      // UNIQUE on path is subsumed, kept only as belt and braces.
      const { error } = await admin.from("catalogue_images").insert({
        label: "Same object, different hash",
        sha256: hex("eeee5555"),
        path: `${SHA_A}.png`,
        purpose: "product",
      });

      expect(error?.code).toBe("23514");
    });

    it("refuses an empty label and one over 120 characters", async () => {
      const sha = hex("0f0f0f0f");
      const empty = await admin
        .from("catalogue_images")
        .insert({ label: "", sha256: sha, path: `${sha}.png`, purpose: "product" });
      expect(empty.error?.code).toBe("23514"); // check_violation

      const tooLong = await admin.from("catalogue_images").insert({
        label: "x".repeat(121),
        sha256: sha,
        path: `${sha}.png`,
        purpose: "product",
      });
      expect(tooLong.error?.code).toBe("23514");
    });

    it("refuses a sha256 that is not 64 lowercase hex characters", async () => {
      // The column IS a picture's identity. A value that is not a hash
      // is a row the bytes it claims to name can never find again, which
      // silently breaks dedup rather than breaking anything visible.
      const cases = [
        hex("AAAA1111"), // uppercase
        "abc123", // too short
        `${hex("aaaa1111")}0`, // too long
        `${"z".repeat(8).repeat(8)}`, // not hex at all
      ];

      for (const sha256 of cases) {
        const { error } = await admin
          .from("catalogue_images")
          .insert({
            label: "Bad hash",
            sha256,
            path: `${sha256}.png`,
            purpose: "product",
          });
        expect(error?.code, `sha256 ${sha256} should have been refused`).toBe(
          "23514",
        );
      }
    });

    it("refuses a path that is not its own sha256 plus a stored extension", async () => {
      // The object key IS the bytes. A path that has drifted from the hash
      // beside it is an entry pointing at somebody else's object — the one
      // thing content addressing exists to make impossible.
      const sha256 = hex("9999abcd");
      const badPaths = [
        "something-else.png", // unrelated key
        sha256, // no extension
        `${sha256}.gif`, // outside the accept list
        `${sha256}.svg`, // no entry was ever one, and uploads are JPEG only
        `${sha256}.jpeg`, // accepted on upload, but normalised to .jpg first
        `prefix/${sha256}.png`, // a folder is not part of the key
        `${sha256}.png.png`,
      ];

      for (const path of badPaths) {
        const { error } = await admin
          .from("catalogue_images")
          .insert({ label: "Bad path", sha256, path, purpose: "product" });
        expect(error?.code, `path ${path} should have been refused`).toBe(
          "23514",
        );
      }

      // The control: every stored extension is admitted — jpg, which uploads
      // get, and the three entries from before uploads were JPEG only carry.
      // The seed varies by index, not by the extension's letters — "jpg" is
      // not hex, and a seed built from it would be refused by the sha256 CHECK
      // before the path CHECK ever saw it, turning this control into a test
      // of the wrong constraint.
      for (const [i, ext] of ["jpg", "png", "webp", "avif"].entries()) {
        const good = hex(`7ec0ffe${i}`);
        const { error } = await admin.from("catalogue_images").insert({
          label: `Good ${ext}`,
          sha256: good,
          path: `${good}.${ext}`,
          purpose: "product",
        });
        expect(error, `extension .${ext} should be storable`).toBeNull();
        await admin.from("catalogue_images").delete().eq("sha256", good);
      }
    });

    it("refuses an image_id with no catalogue entry behind it", async () => {
      // The id is shaped to be impossible rather than merely unlikely: an all-f
      // UUID is not something gen_random_uuid() will hand out.
      //
      // The **trigger** is what refuses this, not the FK. A BEFORE-row trigger
      // runs strictly before the FK's AFTER-row constraint check, so the lookup
      // gets there first and raises with the SQLSTATE the FK would have used —
      // which is why the message is asserted as well as the code. On the code
      // alone this test would go on passing if someone deleted the raise and
      // let a live picture blank instead, since the FK would then produce the
      // same 23503 from one statement later. The FK's only remaining runtime
      // job is the ON DELETE SET NULL action, covered by the entry-delete case
      // above.
      await deleteTestProducts(admin, [LEGACY_PRODUCT]);
      await createTestProduct(admin, { id: LEGACY_PRODUCT });

      const { error } = await admin
        .from("products")
        .update({ image_id: "ffffffff-ffff-ffff-ffff-ffffffffffff" })
        .eq("id", LEGACY_PRODUCT);

      expect(error?.code).toBe("23503"); // foreign_key_violation
      expect(error?.message).toContain("does not exist or is not visible");
      expect(await imageStateOf(LEGACY_PRODUCT)).toMatchObject({
        image_id: null,
      });
    });
  });

  describe("purposes", () => {
    it("refuses to link a product to an entry that is not a product picture", async () => {
      // An entry of another purpose lives in another bucket, so a product
      // showing it would paint a path resolved against the wrong one. The
      // picker offers only product entries, so this is the schema refusing
      // loudly a state the UI cannot produce — on INSERT and UPDATE alike,
      // since the trigger is what derives the path on both.
      await deleteTestProducts(admin, [LEGACY_PRODUCT]);
      await createTestProduct(admin, { id: LEGACY_PRODUCT });
      await seedEntries();

      const { error } = await admin
        .from("products")
        .update({ image_id: ENTRY_WIDE })
        .eq("id", LEGACY_PRODUCT);

      expect(error?.code).toBe("23514"); // check_violation
      expect(error?.message).toContain("can only show a product picture");
      expect(await imageStateOf(LEGACY_PRODUCT)).toEqual({
        image_id: null,
        image_path: null,
      });
    });

    it("requires every entry to state its purpose", async () => {
      // The backfill's default was dropped with it, so a writer that forgets
      // the purpose is refused rather than handed one.
      const sha = hex("5a5a5a5a");
      const { error } = await admin
        .from("catalogue_images")
        // The generated Insert type requires `purpose`; the point here is what
        // the database does when a writer leaves it out.
        // @ts-expect-error -- deliberately missing the required purpose
        .insert({ label: "No purpose", sha256: sha, path: `${sha}.jpg` });

      expect(error?.code).toBe("23502"); // not_null_violation
    });

    it("refuses an update that changes an entry's purpose", async () => {
      // The entry's object lives in its purpose's bucket, and every link to it
      // was checked against its purpose when it was made, so moving the
      // purpose afterwards would name the wrong bucket under each of them.
      // Admins hold UPDATE for the label; the schema refuses the rest loudly.
      await seedEntries();

      const { error } = await adminAuth
        .from("catalogue_images")
        .update({ purpose: "library_cover" })
        .eq("id", ENTRY_A);

      expect(error?.code).toBe("23514"); // check_violation
      expect(error?.message).toContain("purpose never changes");
      const { data } = await admin
        .from("catalogue_images")
        .select("purpose")
        .eq("id", ENTRY_A)
        .single();
      expect(data?.purpose).toBe("product");
    });

    it("still lets an admin rename an entry", async () => {
      await seedEntries();

      const { error } = await adminAuth
        .from("catalogue_images")
        .update({ label: "Renamed fixture A" })
        .eq("id", ENTRY_A);

      expect(error).toBeNull();
      const { data } = await admin
        .from("catalogue_images")
        .select("label, purpose")
        .eq("id", ENTRY_A)
        .single();
      expect(data).toEqual({ label: "Renamed fixture A", purpose: "product" });
    });
  });

  describe("RLS", () => {
    it("shows the catalogue to an admin and nothing to a customer", async () => {
      await seedEntries();

      const asAdmin = await adminAuth
        .from("catalogue_images")
        .select("id, label, path")
        .in("id", ENTRIES);
      expect(asAdmin.error).toBeNull();
      expect(asAdmin.data?.map((row) => row.id).sort()).toEqual(
        [...ENTRIES].sort(),
      );

      // Not an error — RLS filters rather than refuses, which is exactly why
      // this has to be asserted as an empty result rather than a thrown one.
      const asCustomer = await customerAuth
        .from("catalogue_images")
        .select("id")
        .in("id", ENTRIES);
      expect(asCustomer.error).toBeNull();
      expect(asCustomer.data).toEqual([]);
    });
  });
});
