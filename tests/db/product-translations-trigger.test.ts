import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";
import {
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

/**
 * Coverage for the BEFORE-DELETE trigger on product_translations.
 *
 * Rule (post-migration 00047): every product must keep ≥1 translation
 * row in any locale. The previous rule required ≥1 of (en, fi); this
 * suite locks in the relaxed behavior so a future tightening doesn't
 * silently regress.
 */

const PRODUCT_ID = "00000000-0000-0000-0000-0000000005f3";

describe("ensure_product_keeps_at_least_one_translation trigger", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
  });

  afterAll(async () => {
    await deleteTestProducts(admin, [PRODUCT_ID]);
  });

  async function freshProductWithTranslations(
    locales: string[],
  ): Promise<void> {
    await deleteTestProducts(admin, [PRODUCT_ID]);
    await createTestProduct(admin, { id: PRODUCT_ID });
    const rows = locales.map((locale) => ({
      product_id: PRODUCT_ID,
      locale,
      name: `Name in ${locale}`,
      description: `Description in ${locale}`,
    }));
    const { error } = await admin
      .from("product_translations")
      .insert(rows);
    if (error) throw new Error(error.message);
  }

  it("rejects deleting the only translation row", async () => {
    await freshProductWithTranslations(["en"]);

    const { error } = await admin
      .from("product_translations")
      .delete()
      .eq("product_id", PRODUCT_ID)
      .eq("locale", "en");

    expect(error?.code).toBe("23514"); // check_violation
    expect(error?.message).toMatch(/at least one translation/i);

    const { data } = await admin
      .from("product_translations")
      .select("locale")
      .eq("product_id", PRODUCT_ID);
    expect(data?.length).toBe(1); // still there — delete was blocked
  });

  it("allows deleting the last en/fi row when another locale remains (relaxed rule)", async () => {
    // Pre-00047 this delete would have been rejected because no en/fi
    // row would remain. Under the new rule "≥1 row of any locale" is
    // sufficient — sv is enough.
    await freshProductWithTranslations(["en", "sv"]);

    const { error } = await admin
      .from("product_translations")
      .delete()
      .eq("product_id", PRODUCT_ID)
      .eq("locale", "en");

    expect(error).toBeNull();

    const { data } = await admin
      .from("product_translations")
      .select("locale")
      .eq("product_id", PRODUCT_ID);
    expect(data?.map((r) => r.locale).sort()).toEqual(["sv"]);
  });

  it("allows deleting one of several translation rows", async () => {
    await freshProductWithTranslations(["en", "fi", "sv"]);

    const { error } = await admin
      .from("product_translations")
      .delete()
      .eq("product_id", PRODUCT_ID)
      .eq("locale", "fi");

    expect(error).toBeNull();

    const { data } = await admin
      .from("product_translations")
      .select("locale")
      .eq("product_id", PRODUCT_ID);
    expect(data?.map((r) => r.locale).sort()).toEqual(["en", "sv"]);
  });

  it("allows CASCADE delete when the product itself is being removed", async () => {
    // Trigger lets the per-row delete through when the parent row no
    // longer exists. This path matters because there's no way to delete
    // a product without first wiping its translation rows.
    await freshProductWithTranslations(["en"]);

    const { error } = await admin
      .from("products")
      .delete()
      .eq("id", PRODUCT_ID);

    expect(error).toBeNull();

    const { data } = await admin
      .from("product_translations")
      .select("product_id")
      .eq("product_id", PRODUCT_ID);
    expect(data?.length).toBe(0);
  });
});
