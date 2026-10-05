import { describe, expect, it } from "vitest";
import {
  LANDING_SECTION_TYPES,
  LANDING_SECTIONS,
  isCompleteLandingVersion,
  landingSection,
  landingSections,
  landingSectionTextsSchema,
  missingInLandingVersion,
} from "@/lib/landing-pages/sections";
import {
  CASE_IDS as I,
  everySection,
  everyText,
  requiredTextCases,
} from "../../helpers/landing-required-text-cases";

describe("the section registry", () => {
  it("declares every type once, under its own name", () => {
    for (const type of LANDING_SECTION_TYPES) {
      expect(LANDING_SECTIONS[type].type).toBe(type);
      expect(LANDING_SECTIONS[type].label.length).toBeGreaterThan(0);
    }
  });

  it("is exercised in full by the required-text cases", () => {
    const covered = new Set(everySection().map((section) => section.type));
    expect([...covered].sort()).toEqual([...LANDING_SECTION_TYPES].sort());
  });
});

describe("a section's shared fields", () => {
  it("parses a section of every type, lowercasing its ids", () => {
    const hero = landingSection.parse({
      id: I.hero.toUpperCase(),
      type: "hero",
      imageId: ` ${I.picture} `,
    });
    expect(hero).toEqual({ id: I.hero, type: "hero", imageId: I.picture });
    for (const section of everySection()) {
      expect(landingSection.parse(section)).toEqual(section);
    }
  });

  it("refuses a field the type does not have", () => {
    expect(
      landingSection.safeParse({ id: I.cta, type: "cta", button: { kind: "internal", path: "/" }, imageId: I.picture })
        .success,
    ).toBe(false);
  });

  it("refuses an id that is not a uuid", () => {
    expect(landingSection.safeParse({ id: "hero-1", type: "hero" }).success).toBe(false);
  });

  it("takes an internal button as a site path and an external one as an http(s) address", () => {
    const button = (target: unknown) =>
      landingSection.safeParse({ id: I.cta, type: "cta", button: target }).success;
    expect(button({ kind: "internal", path: "/shop/123" })).toBe(true);
    expect(button({ kind: "internal", path: "//evil.example" })).toBe(false);
    expect(button({ kind: "internal", path: "shop" })).toBe(false);
    expect(button({ kind: "external", url: "https://example.com/x" })).toBe(true);
    expect(button({ kind: "external", url: "mailto:hi@example.com" })).toBe(false);
    expect(button({ kind: "external", url: "javascript:alert(1)" })).toBe(false);
  });

  it("holds each list to its counts", () => {
    const points = (n: number) =>
      landingSection.safeParse({
        id: I.points,
        type: "points",
        items: Array.from({ length: n }, (_, i) => ({
          id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
          icon: "star",
        })),
      }).success;
    expect(points(1)).toBe(false);
    expect(points(2)).toBe(true);
    expect(points(6)).toBe(true);
    expect(points(7)).toBe(false);

    const images = (n: number) =>
      landingSection.safeParse({
        id: I.image,
        type: "image",
        images: Array.from({ length: n }, (_, i) => ({
          id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
          imageId: I.picture,
        })),
      }).success;
    expect(images(0)).toBe(false);
    expect(images(4)).toBe(true);
    expect(images(5)).toBe(false);
  });

  it("refuses two items sharing an id", () => {
    expect(
      landingSection.safeParse({
        id: I.steps,
        type: "steps",
        items: [{ id: I.stepA }, { id: I.stepA }],
      }).success,
    ).toBe(false);
  });

  it("takes an icon only from the curated list", () => {
    const icon = (name: string) =>
      landingSection.safeParse({
        id: I.points,
        type: "points",
        items: [
          { id: I.pointA, icon: name },
          { id: I.pointB, icon: "star" },
        ],
      }).success;
    expect(icon("rocket")).toBe(true);
    expect(icon("skull")).toBe(false);
  });
});

describe("the structure", () => {
  it("takes a page whose one hero comes first", () => {
    expect(landingSections.safeParse(everySection()).success).toBe(true);
  });

  it("refuses a page without a hero first, with two heroes, or with a repeated id", () => {
    const [hero, ...rest] = everySection();
    expect(landingSections.safeParse(rest).success).toBe(false);
    expect(landingSections.safeParse([...rest, hero]).success).toBe(false);
    expect(
      landingSections.safeParse([hero, { ...hero, id: I.cta }, ...rest.slice(0, -1)]).success,
    ).toBe(false);
    expect(landingSections.safeParse([hero, { ...rest[0], id: hero.id }]).success).toBe(false);
    expect(landingSections.safeParse([]).success).toBe(false);
  });
});

describe("one language's section texts", () => {
  it("takes each section's words against its own type, trimmed", () => {
    const texts = landingSectionTextsSchema(everySection()).parse({
      ...everyText(),
      [I.cta]: { heading: "  Ready?  ", buttonLabel: "Join" },
    });
    expect(texts[I.cta]).toEqual({ heading: "Ready?", buttonLabel: "Join" });
    expect(texts[I.hero]).toEqual(everyText()[I.hero]);
  });

  it("refuses words for a section the structure does not hold", () => {
    const result = landingSectionTextsSchema(everySection()).safeParse({
      "00000000-0000-4000-8000-00000000ffff": { heading: "Stray" },
    });
    expect(result.success).toBe(false);
  });

  it("refuses a field the section type does not have", () => {
    const result = landingSectionTextsSchema(everySection()).safeParse({
      [I.cta]: { heading: "Ready?", headline: "Wrong field" },
    });
    expect(result.success).toBe(false);
  });
});

describe("the required-text rule (its TypeScript half)", () => {
  for (const testCase of requiredTextCases()) {
    it(testCase.name, () => {
      expect(missingInLandingVersion(testCase.sections, testCase)).toEqual(
        testCase.expected,
      );
      expect(isCompleteLandingVersion(testCase.sections, testCase)).toBe(
        testCase.expected.length === 0,
      );
    });
  }
});
