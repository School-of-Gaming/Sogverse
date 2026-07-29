import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import { createAdminTestClient } from "./helpers";

/**
 * Parity tripwire between the two deliberately separate language systems.
 *
 * `locale` (which translation of the app you see) and `spoken_languages` (the
 * human languages a user speaks / a club is delivered in) are not merged and
 * never should be. But they carry a one-way requirement: shipping a UI locale
 * says we serve families who speak that language, so a club must be offerable
 * in it the same day — and `products.spoken_language_code` can only reference a
 * row in this table.
 *
 * Klingon is exempt: an easter-egg locale is not a language a club is delivered
 * in. It is excluded by name rather than by a "novelty" flag because it is the
 * only one, and a second novelty locale should be a deliberate decision here.
 *
 * This lives in the db suite, not unit, because the reference table is the
 * thing being asserted — a locale added without its migration passes every
 * TypeScript check and only fails here.
 */
describe("UI locale ↔ spoken-language parity", () => {
  const NOVELTY_LOCALES = ["tlh"];
  let admin: SupabaseClient<Database>;

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  it("has a spoken_languages row for every non-novelty locale", async () => {
    const { data, error } = await admin.from("spoken_languages").select("code");
    if (error) throw error;

    const codes = new Set(data.map((row) => row.code));
    const expected = SUPPORTED_LOCALES.filter(
      (locale) => !NOVELTY_LOCALES.includes(locale),
    );
    const missing = expected.filter((locale) => !codes.has(locale));

    expect(missing).toEqual([]);
  });
});
