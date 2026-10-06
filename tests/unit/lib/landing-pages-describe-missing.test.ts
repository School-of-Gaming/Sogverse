import { describe, expect, it } from "vitest";
import {
  describeMissingWords,
  landingSectionName,
} from "@/lib/landing-pages/describe-missing";
import { missingInLandingVersion } from "@/lib/landing-pages/sections";
import {
  CASE_IDS as I,
  everySection,
} from "../../helpers/landing-required-text-cases";

/**
 * **Missing words, said the way an admin counts.** The paths stay keyed by id;
 * the describer reads each one against the structure, numbering sections and
 * items from one and naming a section by its type's label.
 */

const sections = everySection();

describe("describeMissingWords", () => {
  it("numbers a section and an item from one, and names the field", () => {
    expect(describeMissingWords(`sections.${I.faq}.items.${I.faqA}.question`, sections)).toEqual({
      path: `sections.${I.faq}.items.${I.faqA}.question`,
      sectionNumber: 6,
      sectionType: "faq",
      itemNumber: 1,
      field: "question",
      text: "Section 6 (Questions and answers), question 1: the question",
    });
  });

  it("says a section's own field without an item", () => {
    expect(describeMissingWords(`sections.${I.hero}.headline`, sections)).toEqual({
      path: `sections.${I.hero}.headline`,
      sectionNumber: 1,
      sectionType: "hero",
      field: "headline",
      text: "Section 1 (Hero): the headline",
    });
  });

  it("calls an image section's alt text by its picture's number", () => {
    expect(describeMissingWords(`sections.${I.image}.alts.${I.imageItemB}`, sections)).toMatchObject({
      sectionNumber: 3,
      itemNumber: 2,
      field: "alt",
      text: "Section 3 (Pictures), picture 2: the alt text",
    });
  });

  it("names points and steps by what they are", () => {
    expect(describeMissingWords(`sections.${I.points}.items.${I.pointB}.body`, sections).text).toBe(
      "Section 4 (Points), point 2: the body",
    );
    expect(describeMissingWords(`sections.${I.steps}.items.${I.stepA}.title`, sections).text).toBe(
      "Section 5 (Steps), step 1: the title",
    );
  });

  it("says a version's own fields without a section", () => {
    expect(describeMissingWords("slug", sections)).toEqual({
      path: "slug",
      field: "slug",
      text: "The page's address (slug)",
    });
    expect(describeMissingWords("summary", sections).text).toBe("The page's summary");
  });

  it("says plainly when the path names a section the structure no longer has", () => {
    const gone = "00000000-0000-4000-8000-00000000ffff";
    expect(describeMissingWords(`sections.${gone}.heading`, sections)).toEqual({
      path: `sections.${gone}.heading`,
      field: "heading",
      text: "A section no longer on the page: the heading",
    });
  });

  it("describes every path the required-text rule can give, each with its section's number", () => {
    const paths = missingInLandingVersion(sections, {
      title: "",
      summary: "",
      slug: "",
      sectionTexts: {},
    });
    for (const path of paths) {
      const described = describeMissingWords(path, sections);
      expect(described.path).toBe(path);
      if (path.startsWith("sections.")) {
        expect(described.sectionNumber, path).toBeGreaterThan(0);
        expect(described.text, path).toMatch(/^Section \d+ \(/);
      }
      expect(described.text, path).not.toContain("undefined");
    }
  });
});

describe("landingSectionName", () => {
  it("is the one way a section is named, numbered from one", () => {
    expect(landingSectionName(7, "faq")).toBe("section 7 (Questions and answers)");
  });
});
