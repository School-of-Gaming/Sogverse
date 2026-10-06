import type { LandingSection } from "@/lib/landing-pages/sections";
import type { Json } from "@/types/database.types";

/**
 * Cases for the landing pages' required-text rule, which exists twice — in
 * TypeScript (`missingInLandingVersion`) and in SQL (`landing_version_missing`).
 * The unit test holds the TypeScript half to each case's expected answer, and
 * the DB test holds the SQL half equal to the TypeScript half on every case,
 * so the two halves cannot drift without one of them failing.
 *
 * The cases are generated from one page holding every section type with every
 * conditional field present: a fully written version, then that version with
 * each required field taken away in turn — absent, blank, whitespace-only and
 * not a string — plus the conditional fields' absence and a page with no
 * optional extras. A section type added to the registry and left out of the
 * page below fails the unit test's coverage check.
 */

/** Deterministic lowercase uuids, distinct by their last block. */
const id = (n: number): string =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export const CASE_IDS = {
  hero: id(0x1001),
  text: id(0x1002),
  image: id(0x1003),
  points: id(0x1004),
  steps: id(0x1005),
  faq: id(0x1006),
  cta: id(0x1007),
  picture: id(0x2001),
  pictureTwo: id(0x2002),
  imageItemA: id(0x3001),
  imageItemB: id(0x3002),
  pointA: id(0x3003),
  pointB: id(0x3004),
  stepA: id(0x3005),
  stepB: id(0x3006),
  faqA: id(0x3007),
} as const;

const I = CASE_IDS;

/** A page with one section of every type, every conditional field present. */
export function everySection(): LandingSection[] {
  return [
    {
      id: I.hero,
      type: "hero",
      imageId: I.picture,
      button: { kind: "internal", path: "/shop" },
    },
    { id: I.text, type: "text", imageId: I.picture, imageSide: "end" },
    {
      id: I.image,
      type: "image",
      images: [
        { id: I.imageItemA, imageId: I.picture },
        { id: I.imageItemB, imageId: I.pictureTwo },
      ],
    },
    {
      id: I.points,
      type: "points",
      items: [
        { id: I.pointA, icon: "star" },
        { id: I.pointB, icon: "heart" },
      ],
    },
    { id: I.steps, type: "steps", items: [{ id: I.stepA }, { id: I.stepB }] },
    { id: I.faq, type: "faq", items: [{ id: I.faqA }] },
    {
      id: I.cta,
      type: "cta",
      button: { kind: "external", url: "https://example.com" },
    },
  ];
}

/** The same page with no optional picture or button anywhere they are optional. */
export function plainSections(): LandingSection[] {
  return everySection().map((section) => {
    if (section.type === "hero") return { id: section.id, type: "hero" };
    if (section.type === "text") {
      return { id: section.id, type: "text", imageSide: section.imageSide };
    }
    return section;
  });
}

type Texts = Record<string, Record<string, Json>>;

/** Every text field of `everySection()` written, optional ones included. */
export function everyText(): Texts {
  return {
    [I.hero]: {
      eyebrow: "For schools",
      headline: "Gaming clubs at your school",
      subline: "Run by trained game educators.",
      buttonLabel: "See the clubs",
      imageAlt: "Children playing together",
    },
    [I.text]: {
      heading: "How it works",
      body: "We bring **everything**.",
      imageAlt: "A club session",
    },
    [I.image]: {
      heading: "Pictures",
      caption: "From last term",
      alts: { [I.imageItemA]: "First picture", [I.imageItemB]: "Second picture" },
    },
    [I.points]: {
      heading: "Why",
      intro: "Three reasons.",
      items: {
        [I.pointA]: { title: "Safe", body: "Always supervised." },
        [I.pointB]: { title: "Fun", body: "Games they love." },
      },
    },
    [I.steps]: {
      heading: "Getting started",
      items: {
        [I.stepA]: { title: "Sign up", body: "Pick a club." },
        [I.stepB]: { title: "Play", body: "Join the session." },
      },
    },
    [I.faq]: {
      heading: "Questions",
      items: { [I.faqA]: { question: "Is it safe?", answer: "Yes — *always*." } },
    },
    [I.cta]: { heading: "Ready?", body: "Join today.", buttonLabel: "Join" },
  };
}

/** Every required text path of `everySection()`, as both halves name them. */
export const EVERY_REQUIRED_PATH: readonly string[] = [
  `sections.${I.hero}.headline`,
  `sections.${I.hero}.buttonLabel`,
  `sections.${I.hero}.imageAlt`,
  `sections.${I.text}.heading`,
  `sections.${I.text}.body`,
  `sections.${I.text}.imageAlt`,
  `sections.${I.image}.alts.${I.imageItemA}`,
  `sections.${I.image}.alts.${I.imageItemB}`,
  `sections.${I.points}.heading`,
  `sections.${I.points}.items.${I.pointA}.title`,
  `sections.${I.points}.items.${I.pointA}.body`,
  `sections.${I.points}.items.${I.pointB}.title`,
  `sections.${I.points}.items.${I.pointB}.body`,
  `sections.${I.steps}.heading`,
  `sections.${I.steps}.items.${I.stepA}.title`,
  `sections.${I.steps}.items.${I.stepA}.body`,
  `sections.${I.steps}.items.${I.stepB}.title`,
  `sections.${I.steps}.items.${I.stepB}.body`,
  `sections.${I.faq}.heading`,
  `sections.${I.faq}.items.${I.faqA}.question`,
  `sections.${I.faq}.items.${I.faqA}.answer`,
  `sections.${I.cta}.heading`,
  `sections.${I.cta}.buttonLabel`,
];

export interface RequiredTextCase {
  name: string;
  sections: LandingSection[];
  title: string;
  summary: string;
  slug: string;
  sectionTexts: Texts;
  /** What both halves must answer, in order. */
  expected: string[];
}

function isRecord(value: unknown): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A deep copy of `texts` with the field at `path` (the part after
 * `sections.`) replaced, or removed when `value` is undefined.
 */
function withField(texts: Texts, path: string, value: Json | undefined): Texts {
  const copy: Texts = structuredClone(texts);
  const keys = path.split(".");
  let target: unknown = copy;
  for (const key of keys.slice(0, -1)) {
    if (!isRecord(target)) throw new Error(`No field at ${path}`);
    target = target[key];
  }
  if (!isRecord(target)) throw new Error(`No field at ${path}`);
  const last = keys[keys.length - 1];
  if (value === undefined) delete target[last];
  else target[last] = value;
  return copy;
}

const HEAD = { title: "A page", summary: "What it is about.", slug: "a-page" };

export function requiredTextCases(): RequiredTextCase[] {
  const cases: RequiredTextCase[] = [
    {
      name: "a fully written version",
      sections: everySection(),
      ...HEAD,
      sectionTexts: everyText(),
      expected: [],
    },
    {
      name: "nothing written",
      sections: everySection(),
      title: "",
      summary: "",
      slug: "",
      sectionTexts: {},
      expected: ["title", "summary", "slug", ...EVERY_REQUIRED_PATH],
    },
    {
      name: "a blank head, whitespace of every kind",
      sections: everySection(),
      title: " \t",
      summary: "\n",
      slug: "  ",
      sectionTexts: everyText(),
      expected: ["title", "summary", "slug"],
    },
    {
      name: "no optional picture or button: their words are not asked for",
      sections: plainSections(),
      ...HEAD,
      sectionTexts: {
        ...everyText(),
        [I.hero]: { headline: "Gaming clubs" },
        [I.text]: { heading: "How", body: "Like this." },
      },
      expected: [],
    },
    {
      name: "a section's entry missing entirely",
      sections: everySection(),
      ...HEAD,
      sectionTexts: Object.fromEntries(
        Object.entries(everyText()).filter(([key]) => key !== I.points),
      ),
      expected: EVERY_REQUIRED_PATH.filter((path) =>
        path.startsWith(`sections.${I.points}.`),
      ),
    },
    {
      name: "fields that are not strings",
      sections: everySection(),
      ...HEAD,
      sectionTexts: { ...everyText(), [I.cta]: { heading: ["Ready?"], buttonLabel: 7 } },
      expected: [`sections.${I.cta}.heading`, `sections.${I.cta}.buttonLabel`],
    },
    {
      name: "a section's entry that is not an object",
      sections: everySection(),
      ...HEAD,
      sectionTexts: {
        ...everyText(),
        [I.faq]: { heading: "Questions", items: "Is it safe? Yes." },
      },
      expected: [
        `sections.${I.faq}.items.${I.faqA}.question`,
        `sections.${I.faq}.items.${I.faqA}.answer`,
      ],
    },
    {
      name: "text for a section the structure does not hold is ignored",
      sections: everySection(),
      ...HEAD,
      sectionTexts: { ...everyText(), [id(0x9999)]: { heading: "" } },
      expected: [],
    },
  ];

  const field = (path: string) => path.slice("sections.".length);
  const blanks: [string, Json | undefined][] = [
    ["absent", undefined],
    ["blank", ""],
    ["whitespace", "  \n"],
    ["not a string", 42],
  ];
  for (const path of EVERY_REQUIRED_PATH) {
    for (const [how, value] of blanks) {
      cases.push({
        name: `${path} ${how}`,
        sections: everySection(),
        ...HEAD,
        sectionTexts: withField(everyText(), field(path), value),
        expected: [path],
      });
    }
  }

  return cases;
}
