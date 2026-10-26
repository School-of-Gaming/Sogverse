import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";

type VoiceRoomMode = Database["public"]["Enums"]["voice_room_mode"];

/**
 * Coverage for the deferred constraint triggers that hold a product's
 * voice_room_mode = 'none' exactly when at least one of its translations
 * carries voice_join_instructions.
 *
 * Every PostgREST request is its own transaction, so a direct write below is
 * judged at its own commit. The writes that must change the mode and the
 * instructions together go through update_product / create_product, whose
 * statements write the product before its translations — the cases that only
 * a check deferred to commit lets through.
 */

const INSTRUCTIONS = "Open Minecraft and join play.example.com.";

describe("voice join instructions exactly when there is no voice room", () => {
  /** Service role: the direct writes, and reading back past RLS. */
  let admin: SupabaseClient<Database>;
  /** A signed-in admin, for the RPCs, whose guard reads the caller's role. */
  let adminAuth: SupabaseClient<Database>;
  const created: string[] = [];

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
  });

  afterAll(async () => {
    await deleteTestProducts(admin, created);
  });

  /** A Sogverse-room product with one translation per locale, none carrying instructions. */
  async function freshProduct(locales: string[] = ["en"]): Promise<string> {
    const id = await createTestProduct(admin);
    created.push(id);
    const { error } = await admin.from("product_translations").insert(
      locales.map((locale) => ({
        product_id: id,
        locale,
        name: `Voice trigger ${locale}`,
        short_description: "",
      })),
    );
    if (error) throw new Error(error.message);
    return id;
  }

  /**
   * update_product with a full set of arguments and the given voice mode and
   * per-locale instructions — the mode and the translations in one transaction.
   */
  function saveWithVoice(
    id: string,
    mode: VoiceRoomMode,
    instructions: Record<string, string | null>,
  ) {
    return adminAuth.rpc("update_product", {
      p_id: id,
      p_billing_mode: "paid",
      p_translations: Object.entries(instructions).map(([locale, text]) => ({
        locale,
        name: `Voice trigger ${locale}`,
        short_description: "",
        voice_join_instructions: text,
      })),
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
      p_voice_room_mode: mode,
    });
  }

  /** A product of mode none, set up through the RPC. */
  async function noRoomProduct(
    instructions: Record<string, string | null>,
  ): Promise<string> {
    const id = await freshProduct(Object.keys(instructions));
    const { error } = await saveWithVoice(id, "none", instructions);
    if (error) throw new Error(error.message);
    return id;
  }

  async function voiceStateOf(id: string) {
    const { data: product } = await admin
      .from("products")
      .select("voice_room_mode")
      .eq("id", id)
      .single();
    const { data: translations } = await admin
      .from("product_translations")
      .select("locale, voice_join_instructions")
      .eq("product_id", id)
      .order("locale");
    return { mode: product?.voice_room_mode, translations };
  }

  describe("direct writes", () => {
    it("refuses mode none with instructions in no translation, at commit", async () => {
      const id = await freshProduct();

      const { error } = await admin
        .from("products")
        .update({ voice_room_mode: "none" })
        .eq("id", id);

      expect(error?.code).toBe("23514");
      expect(error?.message).toMatch(/needs join instructions/);
      expect((await voiceStateOf(id)).mode).toBe("sogverse");
    });

    it("refuses inserting a product of mode none", async () => {
      // The product alone, with no translation written after it in the same
      // transaction: what commits is a no-room product with no instructions.
      const id = crypto.randomUUID();
      created.push(id);
      const { error } = await admin.from("products").insert({
        id,
        topic: "minecraft_java",
        product_type: "consumer_club",
        billing_mode: "paid",
        start_date: "2099-01-01",
        registration_opens_at: new Date().toISOString(),
        timezone: "UTC",
        is_remote: true,
        for_gamers: true,
        for_parents: false,
        min_age: 8,
        max_age: 18,
        spoken_language_code: "en",
        voice_room_mode: "none",
        created_by: TEST_IDS.ADMIN,
      });

      expect(error?.code).toBe("23514");
      expect(error?.message).toMatch(/needs join instructions/);
    });

    it("refuses instructions written onto a translation under another mode", async () => {
      const id = await freshProduct();

      const { error } = await admin
        .from("product_translations")
        .update({ voice_join_instructions: INSTRUCTIONS })
        .eq("product_id", id)
        .eq("locale", "en");

      expect(error?.code).toBe("23514");
      expect(error?.message).toMatch(/belong only to a product with no voice room/);
      expect((await voiceStateOf(id)).translations).toEqual([
        { locale: "en", voice_join_instructions: null },
      ]);
    });

    it("refuses a new translation carrying instructions under another mode", async () => {
      const id = await freshProduct();

      const { error } = await admin.from("product_translations").insert({
        product_id: id,
        locale: "fi",
        name: "Voice trigger fi",
        short_description: "",
        voice_join_instructions: INSTRUCTIONS,
      });

      expect(error?.code).toBe("23514");
      expect(error?.message).toMatch(/belong only to a product with no voice room/);
    });

    it("refuses switching a product that carries instructions to another mode", async () => {
      const id = await noRoomProduct({ en: INSTRUCTIONS });

      const { error } = await admin
        .from("products")
        .update({ voice_room_mode: "sogverse" })
        .eq("id", id);

      expect(error?.code).toBe("23514");
      expect(error?.message).toMatch(/belong only to a product with no voice room/);
      expect((await voiceStateOf(id)).mode).toBe("none");
    });

    it("refuses clearing the last instructions while the mode is none", async () => {
      const id = await noRoomProduct({ en: INSTRUCTIONS });

      const { error } = await admin
        .from("product_translations")
        .update({ voice_join_instructions: null })
        .eq("product_id", id);

      expect(error?.code).toBe("23514");
      expect(error?.message).toMatch(/needs join instructions/);
      expect((await voiceStateOf(id)).translations).toEqual([
        { locale: "en", voice_join_instructions: INSTRUCTIONS },
      ]);
    });

    it("allows clearing one locale's instructions while another keeps them", async () => {
      const id = await noRoomProduct({ en: INSTRUCTIONS, fi: "Avaa Minecraft." });

      const { error } = await admin
        .from("product_translations")
        .update({ voice_join_instructions: null })
        .eq("product_id", id)
        .eq("locale", "fi");

      expect(error).toBeNull();
    });

    it("refuses deleting the only translation that carries instructions while the mode is none", async () => {
      // fi stays behind, so the keep-one-translation trigger has nothing to
      // say: this refusal is the voice rule's alone.
      const id = await noRoomProduct({ en: INSTRUCTIONS, fi: null });

      const { error } = await admin
        .from("product_translations")
        .delete()
        .eq("product_id", id)
        .eq("locale", "en");

      expect(error?.code).toBe("23514");
      expect(error?.message).toMatch(/needs join instructions/);
      expect((await voiceStateOf(id)).translations).toEqual([
        { locale: "en", voice_join_instructions: INSTRUCTIONS },
        { locale: "fi", voice_join_instructions: null },
      ]);
    });

    it("refuses moving the carrying translation away, checking the product it left", async () => {
      // Both products are of mode none, so the product the translation lands
      // on is satisfied either way: only the old one can refuse.
      const from = await noRoomProduct({ en: INSTRUCTIONS, fi: null });
      const to = await noRoomProduct({ fi: "Avaa Minecraft." });

      const { error } = await admin
        .from("product_translations")
        .update({ product_id: to })
        .eq("product_id", from)
        .eq("locale", "en");

      expect(error?.code).toBe("23514");
      expect(error?.message).toContain(from);
    });

    it("allows deleting a whole product of mode none, its translations cascading away", async () => {
      const id = await noRoomProduct({ en: INSTRUCTIONS });

      const { error } = await admin.from("products").delete().eq("id", id);

      expect(error).toBeNull();
      const { data } = await admin
        .from("product_translations")
        .select("product_id")
        .eq("product_id", id);
      expect(data).toEqual([]);
    });
  });

  describe("the product writers, mode and instructions in one transaction", () => {
    it("update_product switches a product to mode none and writes its instructions", async () => {
      // update_product updates the product before it replaces the
      // translations, so an immediate check would refuse its first statement.
      const id = await freshProduct(["en", "fi"]);

      const { error } = await saveWithVoice(id, "none", { en: INSTRUCTIONS, fi: null });

      expect(error).toBeNull();
      expect(await voiceStateOf(id)).toEqual({
        mode: "none",
        translations: [
          { locale: "en", voice_join_instructions: INSTRUCTIONS },
          { locale: "fi", voice_join_instructions: null },
        ],
      });
    });

    it("update_product switches a product back to a Sogverse room and clears its instructions", async () => {
      const id = await noRoomProduct({ en: INSTRUCTIONS });

      const { error } = await saveWithVoice(id, "sogverse", { en: null });

      expect(error).toBeNull();
      expect(await voiceStateOf(id)).toEqual({
        mode: "sogverse",
        translations: [{ locale: "en", voice_join_instructions: null }],
      });
    });

    it("update_product still refuses mode none with instructions in no translation", async () => {
      const id = await freshProduct();

      const { error } = await saveWithVoice(id, "none", { en: null });

      expect(error?.code).toBe("23514");
      expect(error?.message).toMatch(/needs join instructions/);
      expect((await voiceStateOf(id)).mode).toBe("sogverse");
    });

    it("create_product creates a product of mode none with its instructions", async () => {
      // create_product inserts the product before its translations.
      const { data: id, error } = await adminAuth.rpc("create_product", {
        p_product_type: "consumer_club",
        p_billing_mode: "free",
        p_translations: [
          {
            locale: "en",
            name: "Voice trigger en",
            short_description: "",
            voice_join_instructions: INSTRUCTIONS,
          },
        ],
        p_topic: "minecraft_java",
        p_spoken_language_code: "en",
        p_is_remote: true,
        p_timezone: "UTC",
        p_registration_opens_at: new Date().toISOString(),
        p_start_date: "2099-01-01",
        p_for_gamers: true,
        p_for_parents: false,
        p_min_age: 8,
        p_max_age: 18,
        p_voice_room_mode: "none",
      });
      if (id) created.push(id);

      expect(error).toBeNull();
      expect(await voiceStateOf(id!)).toEqual({
        mode: "none",
        translations: [{ locale: "en", voice_join_instructions: INSTRUCTIONS }],
      });
    });
  });
});
