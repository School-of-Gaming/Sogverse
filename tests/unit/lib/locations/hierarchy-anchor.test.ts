import { describe, expect, it } from "vitest";

import { SUPPORTED_COUNTRIES } from "@/lib/constants/location-hierarchies";

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
    // A venue is created directly beneath the row an admin confirmed in the
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
    const seeded = SUPPORTED_COUNTRIES.filter((country) => country.seeded);
    expect(seeded.map((country) => country.code)).toEqual(["FI", "FR", "SE"]);

    for (const country of seeded) {
      expect(country.anchor, `${country.code} is seeded, so its anchor`).toBe("municipality");
    }
  });
});
