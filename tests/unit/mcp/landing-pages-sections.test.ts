import { describe, expect, it } from "vitest";
import {
  LANDING_ICONS,
  LANDING_SECTION_TYPES,
  LANDING_SECTIONS,
  landingSections,
  type LandingSectionType,
} from "@/lib/landing-pages/sections";
import {
  MCP_LANDING_SECTIONS,
  SECTIONS_MANUAL,
  describeRequiredWords,
  mcpLandingStructure,
  withIds,
} from "@/lib/mcp/landing-pages-sections";

/**
 * **The MCP tools' section schemas against the registry's.** The registry is
 * zod 3 and the tools declare every type again in zod 4, which the SDK can
 * turn into JSON Schema; this runs both declarations over one set of samples
 * per type and requires the same verdict — and, where both accept, the same
 * value — so neither can drift from the other.
 */

const ID = "3f1c2a7e-8d4b-4e59-9a61-0b7c5d2e8f13";
const ID2 = "9d39dd23-2b00-43f4-a0f5-af63bd58ad67";
const ID3 = "5b0a3f0e-1c55-4c43-8d2e-6a7f3f0f2a90";
const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

const internal = { kind: "internal", path: "/shop/123" };
const external = { kind: "external", url: "https://example.com/x" };
const email = { kind: "email", to: "hello@sog.gg" };

/** Shared-field samples per type, accepted and refused alike. */
const STRUCTURES: Record<LandingSectionType, unknown[]> = {
  hero: [
    { id: ID, type: "hero" },
    { id: ` ${ID.toUpperCase()} `, type: "hero", imageId: ID2, button: internal },
    { id: ID, type: "hero", button: external },
    { id: ID, type: "hero", button: email },
    { id: ID, type: "hero", button: { kind: "email", to: " Hello.There@mail.sog.gg " } },
    { id: ID, type: "hero", button: { kind: "email", to: "hello@sog" } },
    { id: ID, type: "hero", button: { kind: "email", to: "hello@sog.gg", subject: "Hi" } },
    { id: ID, type: "hero", button: { kind: "email", url: "hello@sog.gg" } },
    { id: ID, type: "hero", button: { kind: "internal", path: "//evil.com" } },
    { id: ID, type: "hero", button: { kind: "internal", path: "shop" } },
    { id: ID, type: "hero", button: { kind: "external", url: "ftp://example.com" } },
    { id: ID, type: "hero", button: { kind: "external", url: "not a url" } },
    { id: ID, type: "hero", button: { kind: "external", url: " https://example.com " } },
    { id: ID, type: "hero", button: { kind: "internal", path: "/x", url: "https://e.com" } },
    { id: ID, type: "hero", imageId: "nope" },
    { id: "nope", type: "hero" },
    { id: ID, type: "hero", extra: true },
  ],
  text: [
    { id: ID, type: "text", imageSide: "start" },
    { id: ID, type: "text", imageSide: "end", imageId: ID2 },
    { id: ID, type: "text" },
    { id: ID, type: "text", imageSide: "left" },
  ],
  image: [
    { id: ID, type: "image", images: [{ id: ID2, imageId: ID3 }] },
    { id: ID, type: "image", images: ids(4).map((id) => ({ id, imageId: ID3 })) },
    { id: ID, type: "image", images: ids(5).map((id) => ({ id, imageId: ID3 })) },
    { id: ID, type: "image", images: [] },
    { id: ID, type: "image", images: [{ id: ID2, imageId: ID3 }, { id: ID2, imageId: ID }] },
    { id: ID, type: "image", images: [{ id: ID2 }] },
    { id: ID, type: "image", imageIds: [ID2] },
  ],
  points: [
    { id: ID, type: "points", items: ids(2).map((id) => ({ id, icon: "star" })) },
    { id: ID, type: "points", items: ids(6).map((id, i) => ({ id, icon: LANDING_ICONS[i] })) },
    { id: ID, type: "points", items: ids(7).map((id) => ({ id, icon: "star" })) },
    { id: ID, type: "points", items: ids(1).map((id) => ({ id, icon: "star" })) },
    { id: ID, type: "points", items: ids(2).map((id) => ({ id, icon: "unicorn" })) },
    { id: ID, type: "points", items: [{ id: ID2, icon: "star" }, { id: ID2, icon: "heart" }] },
  ],
  steps: [
    { id: ID, type: "steps", items: ids(2).map((id) => ({ id })) },
    { id: ID, type: "steps", items: ids(6).map((id) => ({ id })) },
    { id: ID, type: "steps", items: ids(7).map((id) => ({ id })) },
    { id: ID, type: "steps", items: ids(1).map((id) => ({ id })) },
    { id: ID, type: "steps", items: [{ id: ID2 }, { id: ID2 }] },
  ],
  faq: [
    { id: ID, type: "faq", items: ids(1).map((id) => ({ id })) },
    { id: ID, type: "faq", items: ids(20).map((id) => ({ id })) },
    { id: ID, type: "faq", items: ids(21).map((id) => ({ id })) },
    { id: ID, type: "faq", items: [] },
    { id: ID, type: "faq", items: [{ id: ID2, question: "?" }] },
  ],
  cta: [
    { id: ID, type: "cta", button: internal },
    { id: ID, type: "cta", button: external },
    { id: ID, type: "cta" },
    { id: ID, type: "cta", button: { kind: "email", to: "a@b.c" } },
    { id: ID, type: "cta", button: { kind: "email", to: "a b@sog.gg" } },
    { id: ID, type: "cta", button: { kind: "external", url: "mailto:a@sog.gg" } },
  ],
};

/** Words samples per type. */
const TEXTS: Record<LandingSectionType, unknown[]> = {
  hero: [
    {},
    { eyebrow: " New ", headline: "Hi", subline: "There", buttonLabel: "Go", imageAlt: "A castle" },
    { headline: "Hi", buttonLabel: "Email us", emailSubject: " A question " },
    { emailSubject: 3 },
    { headline: 3 },
    { heading: "Not a hero field" },
  ],
  text: [
    { heading: "H", body: "**Bold**", imageAlt: "Alt" },
    { body: ["not", "text"] },
    { headline: "Not a text field" },
  ],
  image: [
    { heading: "H", caption: "C", alts: { [ID2]: "A castle" } },
    { alts: { [ID2]: 3 } },
    { alts: "A castle" },
    { items: {} },
  ],
  points: [
    { heading: "H", intro: "I", items: { [ID2]: { title: "T", body: "B" } } },
    { items: { [ID2]: { title: "T", answer: "B" } } },
    { items: [] },
  ],
  steps: [
    { heading: "H", items: { [ID2]: { title: "T" } } },
    { items: { [ID2]: { icon: "star" } } },
  ],
  faq: [
    { heading: "H", items: { [ID2]: { question: "Q?", answer: "A." } } },
    { items: { [ID2]: { title: "Q?" } } },
    { intro: "Not an faq field" },
  ],
  cta: [
    { heading: "H", body: "B", buttonLabel: "Go" },
    { heading: "H", buttonLabel: "Go", emailSubject: "Joining" },
    { buttonLabel: { label: "Go" } },
    { items: {} },
  ],
};

describe.each(LANDING_SECTION_TYPES)("the %s section", (type) => {
  const app = LANDING_SECTIONS[type];
  const mcp = MCP_LANDING_SECTIONS[type];

  it.each(STRUCTURES[type].map((sample) => [JSON.stringify(sample), sample]))(
    "judges the shared fields %s as the registry does",
    (_, sample) => {
      const expected = app.section.safeParse(sample);
      const actual = mcp.structure.safeParse(sample);
      expect(actual.success).toBe(expected.success);
      if (expected.success) expect(actual.data).toEqual(expected.data);
    },
  );

  it.each(TEXTS[type].map((sample) => [JSON.stringify(sample), sample]))(
    "judges the words %s as the registry does",
    (_, sample) => {
      const expected = app.text.safeParse(sample);
      const actual = mcp.text.safeParse(sample);
      expect(actual.success).toBe(expected.success);
      if (expected.success) expect(actual.data).toEqual(expected.data);
    },
  );

  it("has at least one accepted and one refused sample of each kind", () => {
    for (const [samples, schema] of [
      [STRUCTURES[type], app.section],
      [TEXTS[type], app.text],
    ] as const) {
      const verdicts = samples.map((sample) => schema.safeParse(sample).success);
      expect(verdicts).toContain(true);
      expect(verdicts).toContain(false);
    }
  });
});

describe("new sections and items", () => {
  it("are accepted without ids, and given fresh ones the registry accepts", () => {
    const sent = [
      { type: "hero" },
      { id: ID, type: "image", images: [{ imageId: ID3 }, { id: ID2, imageId: ID3 }] },
      { type: "points", items: [{ icon: "star" }, { icon: "heart" }] },
    ];
    expect(mcpLandingStructure.safeParse(sent).success).toBe(true);

    let n = 0;
    const filled = withIds(sent, () => ids(10)[n++]);

    const parsed = landingSections.parse(filled);
    expect(parsed[0].id).toBe(ids(10)[0]);
    expect(parsed[1]).toEqual({
      id: ID,
      type: "image",
      images: [
        { id: ids(10)[1], imageId: ID3 },
        { id: ID2, imageId: ID3 },
      ],
    });
    expect(parsed[2]).toMatchObject({
      id: ids(10)[2],
      items: [{ id: ids(10)[3] }, { id: ids(10)[4] }],
    });
  });
});

describe("the manual", () => {
  it("states each type's required words by running the registry's rule", () => {
    expect(describeRequiredWords("hero")).toBe(
      "headline; imageAlt when imageId is set; buttonLabel when button is set",
    );
    expect(describeRequiredWords("text")).toBe("heading; body; imageAlt when imageId is set");
    expect(describeRequiredWords("image")).toBe("alts.<picture id>");
    expect(describeRequiredWords("points")).toBe(
      "heading; items.<item id>.title; items.<item id>.body",
    );
    expect(describeRequiredWords("faq")).toBe(
      "heading; items.<item id>.question; items.<item id>.answer",
    );
    expect(describeRequiredWords("cta")).toBe("heading; buttonLabel");
  });

  it("names every type, the arrangement rule and the icons", () => {
    for (const type of LANDING_SECTION_TYPES) expect(SECTIONS_MANUAL).toContain(`- ${type} (`);
    expect(SECTIONS_MANUAL).toContain("A page starts with its hero section");
    expect(SECTIONS_MANUAL).toContain("A page has exactly one hero section");
    expect(SECTIONS_MANUAL).toContain(LANDING_ICONS.join(", "));
  });
});
