import { describe, it, expect } from "vitest";
import {
  municipalitySlug,
  findMunicipalityBySlug,
} from "@/lib/locations/municipality-slug";
import type { Location } from "@/types";

describe("municipalitySlug", () => {
  it("lowercases and strips Finnish/Swedish diacritics", () => {
    expect(municipalitySlug("Helsinki")).toBe("helsinki");
    expect(municipalitySlug("Espoo")).toBe("espoo");
    expect(municipalitySlug("Ähtäri")).toBe("ahtari");
    expect(municipalitySlug("Ylöjärvi")).toBe("ylojarvi");
    expect(municipalitySlug("Föglö")).toBe("foglo");
    expect(municipalitySlug("Vöyri")).toBe("voyri");
    expect(municipalitySlug("Pyhtää")).toBe("pyhtaa");
  });

  it("turns spaces and punctuation into single hyphens, trimmed", () => {
    expect(municipalitySlug("Koski Tl")).toBe("koski-tl");
    expect(municipalitySlug("Pedersören kunta")).toBe("pedersoren-kunta");
    expect(municipalitySlug("  Spaced  Name  ")).toBe("spaced-name");
  });

  it("produces only [a-z0-9-] with no leading/trailing/double hyphens", () => {
    const samples = ["Ähtäri", "Koski Tl", "Pedersören kunta", "Maarianhamina"];
    for (const name of samples) {
      const slug = municipalitySlug(name);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(slug.startsWith("-")).toBe(false);
      expect(slug.endsWith("-")).toBe(false);
      expect(slug.includes("--")).toBe(false);
    }
  });

  // The slug scheme has no collision-suffix logic, so it only works if every
  // municipality maps to a distinct slug. Lock that on a hand-picked spread that
  // stresses the transform: diacritics, Åland's Swedish names, a hyphenated
  // name, the shortest name, a space + abbreviation, and two near-identical
  // names that must NOT collapse together.
  it("maps a representative spread of municipalities to distinct slugs", () => {
    const cases: Record<string, string> = {
      Helsinki: "helsinki",
      Jyväskylä: "jyvaskyla",
      Ähtäri: "ahtari",
      Maarianhamina: "maarianhamina",
      Kökar: "kokar",
      Föglö: "foglo",
      "Mänttä-Vilppula": "mantta-vilppula",
      Ii: "ii",
      Pyhäjärvi: "pyhajarvi",
      Pyhäjoki: "pyhajoki",
      "Koski Tl": "koski-tl",
      "Pedersören kunta": "pedersoren-kunta",
    };

    for (const [name, expected] of Object.entries(cases)) {
      expect(municipalitySlug(name)).toBe(expected);
    }

    const slugs = Object.values(cases);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("findMunicipalityBySlug", () => {
  const locations: Location[] = [
    loc("h", "Helsinki", "municipality", { sv: "Helsingfors" }),
    loc("y", "Ylöjärvi", "municipality"),
    loc("r", "Uusimaa", "region"),
  ];

  it("resolves a slug back to its municipality", () => {
    expect(findMunicipalityBySlug(locations, "helsinki")?.id).toBe("h");
    expect(findMunicipalityBySlug(locations, "ylojarvi")?.id).toBe("y");
  });

  it("resolves the alternate-locale (Swedish) slug to the same row", () => {
    expect(findMunicipalityBySlug(locations, "helsingfors")?.id).toBe("h");
  });

  it("prefers the canonical slug over an exonym match", () => {
    // A row whose native name slugifies to the query wins over any row that
    // only matches via an alternate name.
    const withClash: Location[] = [
      ...locations,
      loc("clash", "Helsingfors", "municipality"), // native name == the sv slug
    ];
    // The canonical "helsinki" still maps to h; the exonym "helsingfors" now has
    // a native match (clash) which takes priority over h's alternate.
    expect(findMunicipalityBySlug(withClash, "helsingfors")?.id).toBe("clash");
  });

  it("ignores non-municipality rows and returns null on miss", () => {
    // "uusimaa" would slugify-match the region row, but only municipalities
    // are considered.
    expect(findMunicipalityBySlug(locations, "uusimaa")).toBeNull();
    expect(findMunicipalityBySlug(locations, "nope")).toBeNull();
  });
});

function loc(
  id: string,
  name: string,
  type: Location["type"],
  name_i18n: Location["name_i18n"] = null,
): Location {
  return {
    id,
    name,
    name_i18n,
    type,
    parent_id: null,
    country_code: "FI",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}
