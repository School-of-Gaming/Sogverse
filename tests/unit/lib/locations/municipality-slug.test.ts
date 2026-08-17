import { describe, it, expect } from "vitest";
import { municipalitySlug } from "@/lib/locations/municipality-slug";

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
