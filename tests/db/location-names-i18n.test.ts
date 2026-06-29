import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { createAdminTestClient } from "./helpers";

/**
 * Locks the localized-name backfill from migration 00110. The Swedish names are
 * official (Kotus / Government Decree 1385/2022); this is the safety net that a
 * future re-seed or rename doesn't silently drop them. We assert distinctive
 * rows the *migration* creates (not the seed.sql fixture) so the lookups are
 * unambiguous, and we resolve through the production helper so the test also
 * covers the resolve path. The two negative cases prove we only store genuine
 * differences: an untranslated row resolves back to its Finnish `name`.
 */
describe("locations name_i18n backfill (00110)", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  /** Resolve a row's Swedish display name (falls back to `name` when none). */
  async function svName(name: string, type: "region" | "municipality") {
    const { data, error } = await admin
      .from("locations")
      .select("name, name_i18n")
      .eq("country_code", "FI")
      .eq("type", type)
      .eq("name", name);
    if (error) throw error;
    // The migration creates exactly one such row; seed.sql adds Helsinki/Uusimaa
    // duplicates, so we deliberately probe names the fixture does NOT add.
    expect(data).toHaveLength(1);
    return localizedLocationName(data[0], "sv");
  }

  it("gives bilingual municipalities their official Swedish name", async () => {
    expect(await svName("Turku", "municipality")).toBe("Åbo");
    expect(await svName("Maarianhamina", "municipality")).toBe("Mariehamn");
    expect(await svName("Vaasa", "municipality")).toBe("Vasa");
    expect(await svName("Pietarsaari", "municipality")).toBe("Jakobstad");
  });

  it("gives regions their official Swedish name", async () => {
    expect(await svName("Pohjanmaa", "region")).toBe("Österbotten");
    expect(await svName("Varsinais-Suomi", "region")).toBe("Egentliga Finland");
  });

  it("leaves monolingual-Finnish and identical-name rows untranslated", async () => {
    // Tampere has only a traditional exonym (Tammerfors), not a legal Swedish
    // name — so no override and it resolves back to "Tampere". Satakunta's
    // Swedish name equals its Finnish, so likewise no override.
    expect(await svName("Tampere", "municipality")).toBe("Tampere");
    expect(await svName("Satakunta", "region")).toBe("Satakunta");
  });
});
