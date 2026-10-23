import { describe, expect, it } from "vitest";
import { landingSections } from "@/lib/landing-pages/sections";
import { issueSentence } from "@/lib/mcp/landing-pages-call";

/**
 * **A schema's refusal as a sentence.** Every landing tool says where an
 * issue is the way every other answer does: a section as "section N (Type
 * label)" numbered from one, an item by its number, never a zero-based index
 * or a bare id path.
 */

const HERO = "a1000000-0000-4000-8000-000000000001";
const FAQ = "a1000000-0000-4000-8000-000000000003";
const sections = [
  { id: HERO, type: "hero" },
  { type: "faq", id: FAQ },
];

describe("issueSentence", () => {
  it("names a section sent in a structure by its position, from one", () => {
    expect(
      issueSentence({ path: ["sections", 1, "items", 0], message: "Unrecognized key: \"question\"" }, sections),
    ).toBe('Section 2 (Questions and answers), question 1: Unrecognized key: "question"');
  });

  it("names a section's words by the section the id belongs to", () => {
    expect(
      issueSentence({ path: ["sectionTexts", HERO, "headline"], message: "Expected a string" }, sections),
    ).toBe("The words of section 1 (Hero), headline: Expected a string");
  });

  it("falls back to the number alone for a type it does not know, and to the id for a stray section", () => {
    expect(issueSentence({ path: ["sections", 4, "type"], message: "No such type" }, [])).toBe(
      "Section 5, type: No such type",
    );
    expect(issueSentence({ path: ["sectionTexts", "x", "heading"], message: "Bad" }, sections)).toBe(
      "The words for section x, heading: Bad",
    );
  });

  it("keeps a top-level field's name, and a pathless message as it is", () => {
    expect(issueSentence({ path: ["slug"], message: "Too long" }, sections)).toBe("Slug: Too long");
    expect(issueSentence({ path: [], message: "A page starts with its hero section" }, sections)).toBe(
      "A page starts with its hero section",
    );
  });
});

/**
 * **The structure rule's refusals name what the AI app can find.** An app
 * often sends a new section without an id and the server mints one, so a
 * refusal naming the section by its uuid would name something the app never
 * saw: each is issued at the section's index, and said by its number.
 */
describe("the structure rule's sticky refusals, as an AI app is told them", () => {
  const hero = { type: "hero" };
  const faq = { type: "faq", items: [{}] };
  const subscribe = { type: "subscribe", sticky: "left" };
  const cta = { type: "cta", button: { kind: "internal", path: "/" }, sticky: "left" };
  // As the tool reads a structure: ids minted for what was sent without one.
  const told = (sent: readonly Record<string, unknown>[]) => {
    const parsed = landingSections.safeParse(
      sent.map((section) => ({
        ...section,
        id: crypto.randomUUID(),
        ...(Array.isArray(section.items)
          ? { items: section.items.map(() => ({ id: crypto.randomUUID() })) }
          : {}),
      })),
    );
    return parsed.success
      ? []
      : parsed.error.issues.map((issue) =>
          issueSentence({ path: ["sections", ...issue.path], message: issue.message }, sent),
        );
  };

  it("names a type that may not be sticky by its number, and the allowed types by their keys", () => {
    expect(told([hero, { ...faq, sticky: "right" }, subscribe])).toEqual([
      "Section 2 (Questions and answers): Only a section of type guide, subscribe or cta can be sticky",
    ]);
  });

  it("names a second sticky section on a side, the side and the first by their numbers", () => {
    expect(told([hero, faq, subscribe, cta])).toEqual([
      "Section 4 (Call to action): A page has at most one sticky section on each side, and section 3 is already sticky on the left",
    ]);
  });
});
