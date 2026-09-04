import { describe, expect, it } from "vitest";

import {
  DEFAULT_PRODUCT_TIMEZONE,
  isProductTimezone,
  PRODUCT_TIMEZONES,
  SUPPORTED_COUNTRIES,
} from "@/lib/constants/location-hierarchies";
import { isValidTimezone } from "@/lib/timezone";
// The ingestion config, imported from a test rather than from application code.
// The generators are `.mjs` run by bare `node` and cannot resolve the `@/` path
// alias, which is why they restate the level order instead of reading it — but
// Vitest resolves both, so this is the one place the two declarations of one
// fact can be checked against each other.
import { COUNTRIES } from "../../../../scripts/lib/geonames/config.mjs";

/**
 * Two assertions about the same field, deliberately kept apart.
 *
 * The anchor is the level a parent identifies with and the level a site is
 * parented under. One of those facts is structural and holds for every country
 * anyone might ever configure; the other is a statement about the rows that
 * exist today, and is a tripwire rather than an invariant. Collapsing them into
 * one test would make the tripwire look like a law and invite someone to
 * "fix" a future country's honest config to satisfy it.
 */
describe("country hierarchy anchors", () => {
  it("is the level immediately above `site` in the country's own hierarchy", () => {
    // A site is created directly beneath the row an admin confirmed in the
    // picker, so the anchor cannot be any other level without the picker
    // handing the create route a parent it does not accept. This holds for
    // US/GB/JP too, whose hierarchies put `district` below municipality.
    for (const country of SUPPORTED_COUNTRIES) {
      const siteIndex = country.hierarchy.findIndex((level) => level.type === "site");
      expect(siteIndex, `${country.code} declares no site level`).toBeGreaterThan(0);
      expect(country.anchor, `${country.code} anchor`).toBe(country.hierarchy[siteIndex - 1].type);
    }
  });

  it("is `municipality` for every country whose rows are seeded", () => {
    // Not a law — a tripwire. The pickers hardcode `municipality` as their
    // pickable type (the product form's online-municipality field, a parent's
    // own location), which is correct only while every seeded country anchors
    // there. The day a district-below-municipality country is seeded, this
    // fails, and generalizing those pickers to read the anchor is the work it
    // is asking for. Do that work; do not relax this.
    //
    // The UK is what a seeded country looks like when the speculative entry was
    // wrong: it was sketched Nation → City → Borough and anchored at
    // `district`, and seeding it meant finding out the country has one
    // local-authority rung and re-declaring it there. This tripwire is what
    // made that a decision rather than an accident.
    const seeded = SUPPORTED_COUNTRIES.filter((country) => country.seeded);
    expect(seeded.map((country) => country.code).sort()).toEqual(["FI", "FR", "GB", "SE"]);

    for (const country of seeded) {
      expect(country.anchor, `${country.code} is seeded, so its anchor`).toBe("municipality");
    }
  });
});

/**
 * The same shape, declared twice, checked here and nowhere else.
 *
 * A country's levels live in two files: `SUPPORTED_COUNTRIES` says what each
 * level is *called*, and `scripts/lib/geonames/config.mjs` says which row is
 * whose parent when the seed is generated. The duplication is forced — the
 * generators run under bare `node` and cannot resolve a TypeScript path alias —
 * and nothing at generation time can catch a disagreement, because the
 * generator has no way to read the other side. What a disagreement produces is
 * a tree seeded at one shape and labelled at another: France's communes filed
 * under a level the UI calls something else, with every gate passing.
 *
 * So it is checked from a test, which resolves both.
 */
describe("the ingestion config and the UI hierarchy config", () => {
  it("declare the same levels for every country the generator can seed", () => {
    for (const [code, entry] of Object.entries(COUNTRIES)) {
      const country = SUPPORTED_COUNTRIES.find((candidate) => candidate.code === code);
      expect(country, `${code} has an ingestion config but no hierarchy config`).toBeDefined();

      // `site` is absent from the ingestion config by design: sites are created
      // by admins and never seeded, so the generator has no business knowing
      // the level exists. Everything above it must match, in order.
      const seededLevels = country!.hierarchy
        .map((level) => level.type)
        .filter((type) => type !== "site");

      expect(entry.levelOrder, `${code} levelOrder`).toEqual(seededLevels);
    }
  });

  it("agree on which countries are seeded at all", () => {
    // `seeded` is a declared flag rather than a query, and this is what keeps
    // it honest: a country gets rows by having an ingestion config entry, so
    // the two sets are the same set. A flag flipped without an entry means a
    // seed that cannot be generated; an entry without the flag means the anchor
    // tripwire above stops covering a country whose rows are live.
    const configured = Object.keys(COUNTRIES).sort();
    const declared = SUPPORTED_COUNTRIES.filter((country) => country.seeded)
      .map((country) => country.code)
      .sort();

    expect(configured).toEqual(declared);
  });
});

/**
 * The zones the admin product form offers, which are derived from this same
 * country config rather than listed anywhere else.
 *
 * The type does most of the work — `timezones` is a required non-empty tuple,
 * so a new country entry without one does not compile and the "add a country"
 * process cannot quietly leave the picker behind. What the type cannot check is
 * whether the strings name real zones, or whether the derivation still produces
 * the list the form is meant to show.
 */
describe("the zones a product can be scheduled in", () => {
  it("gives every configured country at least one real IANA zone", () => {
    for (const country of SUPPORTED_COUNTRIES) {
      expect(
        country.timezones.length,
        `${country.code} declares no timezone`,
      ).toBeGreaterThan(0);
      for (const zone of country.timezones) {
        // A typo here would reach `Intl` as a `timeZone` option and throw at
        // render time, on the one product authored in that country.
        expect(isValidTimezone(zone), `${country.code} zone ${zone}`).toBe(true);
      }
    }
  });

  it("offers exactly the seeded countries' zones, default first", () => {
    // Not a restatement of the config: it is the *derivation* that is pinned —
    // seeded only, deduped, and led by the default so the create form's first
    // option is the one it starts on. The day a fifth country is seeded this
    // fails, which is the reminder that the picker grew.
    expect(PRODUCT_TIMEZONES).toEqual([
      "Europe/Helsinki",
      "Europe/Paris",
      "Europe/London",
      "Europe/Stockholm",
    ]);
    expect(PRODUCT_TIMEZONES[0]).toBe(DEFAULT_PRODUCT_TIMEZONE);
  });

  it("recognizes only the zones it offers", () => {
    for (const zone of PRODUCT_TIMEZONES) {
      expect(isProductTimezone(zone), zone).toBe(true);
    }
    // A real, well-formed IANA zone in a country we do not operate in — the
    // shape the write contract has to refuse, and the reason it refines rather
    // than taking any string `Intl` accepts.
    expect(isProductTimezone("Europe/Berlin")).toBe(false);
  });
});
