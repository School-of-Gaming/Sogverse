import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  localizedLocationName,
  localizedNameAlternates,
} from "@/lib/locations/localized-name";
import { municipalitySlug } from "@/lib/locations/municipality-slug";
import { createAdminTestClient } from "./helpers";

/**
 * `name_i18n` on Finland's rows, under the contract the GeoNames cutover put
 * there.
 *
 * The column used to hold a curated list: the *legal* Swedish names of the
 * officially bilingual and Swedish-monolingual municipalities, 51 rows sourced
 * from Kotus and Government Decree 1385/2022. It now holds whatever resolving
 * GeoNames' `sv` alternates produces — customary exonyms alongside legal names,
 * uncurated, at upstream's quality — because owning zero curated data was worth
 * more than the legal/customary distinction.
 *
 * What that trade actually bought and cost is what this file pins, because a
 * count in a config comment is not a guarantee:
 *
 *  - the legal names are still there (50 of the 51, exactly),
 *  - the one that changed changed to a known value and no other,
 *  - the exonyms the old contract excluded are there now,
 *  - the never-duplicate rule still holds mechanically, and
 *  - the slug space stays 1:1 across canonical names *and* every alternate,
 *    which is the invariant `/schools/<slug>` has no disambiguation suffix for
 *    and which the exonyms widened by ~80 candidates the old check never saw.
 *
 * Rows are looked up by their Finnish `name` and resolved through the
 * production helper, so the resolve path is covered too. The names probed are
 * deliberately ones `supabase/seed.sql`'s fixture tree does not also add
 * (it adds a second Helsinki and Uusimaa), so each lookup is unambiguous.
 */
describe("locations name_i18n, GeoNames-sourced", () => {
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
    expect(data).toHaveLength(1);
    return localizedLocationName(data[0], "sv");
  }

  it("keeps the legal Swedish names the curated list held", async () => {
    expect(await svName("Turku", "municipality")).toBe("Åbo");
    expect(await svName("Maarianhamina", "municipality")).toBe("Mariehamn");
    expect(await svName("Vaasa", "municipality")).toBe("Vasa");
    expect(await svName("Pietarsaari", "municipality")).toBe("Jakobstad");
    expect(await svName("Pohjanmaa", "region")).toBe("Österbotten");
    expect(await svName("Varsinais-Suomi", "region")).toBe("Egentliga Finland");
  });

  it("gains the customary exonyms the legal-only contract excluded", async () => {
    // None of these is a legal Swedish name — every one of these municipalities
    // is monolingual Finnish by law — and all of them are what a Finland-Swedish
    // speaker actually says. This is the half of the trade that was the reason
    // for making it.
    expect(await svName("Tampere", "municipality")).toBe("Tammerfors");
    expect(await svName("Uusikaupunki", "municipality")).toBe("Nystad");
    expect(await svName("Savonlinna", "municipality")).toBe("Nyslott");
    expect(await svName("Tornio", "municipality")).toBe("Torneå");
  });

  it("loses precision on exactly one region, and it is the known one", async () => {
    // Kanta-Häme's legal Swedish name is "Egentliga Tavastland"; GeoNames'
    // preferred `sv` alternate is the plain "Tavastland". This is the single
    // disagreement across all 51 curated entries, it is recorded in the config,
    // and the fix for it is flagging the right alternate upstream — never a
    // local override, which is the thing this whole supply exists to stop
    // owning.
    expect(await svName("Kanta-Häme", "region")).toBe("Tavastland");
  });

  it("stores nothing where the Swedish name equals the Finnish one", async () => {
    // The never-duplicate rule, now mechanical rather than editorial: a locale
    // resolving to the canonical name contributes no key, because the display
    // resolver already falls back to `name` for it.
    expect(await svName("Satakunta", "region")).toBe("Satakunta");
    expect(await svName("Korsnäs", "municipality")).toBe("Korsnäs");
  });

  it("never duplicates a row's own name into name_i18n, anywhere in Finland", async () => {
    const { data, error } = await admin
      .from("locations")
      .select("name, name_i18n")
      .eq("country_code", "FI")
      .in("type", ["country", "region", "municipality"]);
    if (error) throw error;

    const offenders = data.filter(
      (row) =>
        localizedNameAlternates(row).includes(row.name) ||
        // A `fi` key is the same fault seen from the other side: Finnish is the
        // canonical language of these rows, so it lives in `name`. Asked
        // through the resolver, which returns `name` when the key is absent —
        // so a `fi` key holding anything at all shows up here.
        localizedLocationName(row, "fi") !== row.name,
    );

    expect(offenders.map((row) => row.name)).toEqual([]);
  });

  // The invariant `/schools/<slug>` rests on, re-checked over the data the
  // cutover actually produced. Slug resolution is first-match-wins over the
  // canonical names and then over every alternate, so a collision there is
  // silent — one municipality's page simply answers for another's link. The
  // canonical 308 were checked when the scheme was written; the ~83 exonyms the
  // cutover added are ~83 slug candidates that check never saw.
  it("maps every Finnish municipality name and alternate to a distinct slug", async () => {
    const { data, error } = await admin
      .from("locations")
      .select("name, name_i18n, external_code")
      .eq("country_code", "FI")
      .eq("type", "municipality")
      .not("external_code", "is", null);
    if (error) throw error;

    expect(data.length).toBe(308);

    const claimedBy = new Map<string, Set<string>>();
    for (const row of data) {
      for (const candidate of [row.name, ...localizedNameAlternates(row)]) {
        const slug = municipalitySlug(candidate);
        const owners = claimedBy.get(slug) ?? new Set<string>();
        owners.add(`${row.external_code} ${row.name}`);
        claimedBy.set(slug, owners);
      }
    }

    const collisions = [...claimedBy]
      .filter(([, owners]) => owners.size > 1)
      .map(([slug, owners]) => `${slug}: ${[...owners].join(" / ")}`);

    expect(collisions).toEqual([]);
  });
});
