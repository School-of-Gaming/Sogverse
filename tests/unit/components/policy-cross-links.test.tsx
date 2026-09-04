import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import messages from "@/../messages/en.json";
import fi from "@/../messages/fi.json";
import fr from "@/../messages/fr.json";
import sv from "@/../messages/sv.json";
import tlh from "@/../messages/tlh.json";
import { PolicyPage } from "@/components/legal/policy-page";
import { policyTextSegments } from "@/components/legal/policy-content";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";

/**
 * **Where one of our legal documents names another, the name is a link — and
 * the copy that carries the markup lives in a translated message file.**
 *
 * That is the whole risk here. The tags are written by whoever edits the copy,
 * in five languages, in a document a family may be held to; the renderer has to
 * be unsurprising about every way one can be wrong. Three properties do the
 * work, and this file pins all three:
 *
 * 1. **The words survive, always.** A reader must see the sentence the writer
 *    wrote, tag or no tag, known tag or not. Stripping the markup can never
 *    strip a clause.
 * 2. **The allow-list is closed, and hrefs come from `ROUTES`.** Only the six
 *    documents we own become links, and none of them at a hardcoded path.
 * 3. **No page links to itself.** A citation of the page you are already on is
 *    a dead end, and it is the easy mistake to make while sweeping the catalog.
 *
 * Properties 2 and 3 run over **every catalog that carries these documents**,
 * not just English, and each translation is additionally held to English's tags
 * key for key. The completeness script compares keys and ICU placeholders and
 * never looks inside a value for a tag, so a Finnish paragraph that quietly
 * loses its `<linkPrivacy>` wrapper would otherwise ship a binding document with
 * a missing link in the one language nobody reviewing English would open.
 *
 * Klingon carries none of them, on purpose, and gets the opposite assertion —
 * see below.
 *
 * Rendered to static markup rather than driven in jsdom: a legal page has no
 * interactivity and the server's HTML is the whole of what a reader meets.
 */

/** Every tag the catalogs may use, and the page each one must open. */
const TAG_ROUTES = {
  linkPrivacy: ROUTES.privacy,
  linkTerms: ROUTES.termsAndConditions,
  linkDiscipline: ROUTES.antiBullying,
  linkRobloxPrivacy: ROUTES.robloxPrivacy,
  linkRobloxSafeguarding: ROUTES.robloxSafeguarding,
  linkRobloxTerms: ROUTES.robloxTerms,
} as const;

/** The six documents: the namespace each one's copy lives in, and its own tag. */
const LEGAL_DOCUMENTS = [
  { name: "privacy", ownTag: "linkPrivacy" },
  { name: "terms", ownTag: "linkTerms" },
  { name: "discipline", ownTag: "linkDiscipline" },
  { name: "robloxPrivacy", ownTag: "linkRobloxPrivacy" },
  { name: "robloxSafeguarding", ownTag: "linkRobloxSafeguarding" },
  { name: "robloxTerms", ownTag: "linkRobloxTerms" },
] as const;

/**
 * Every catalog that translates these documents, English first — it is what the
 * rest are measured against. Klingon is absent by design (see below).
 */
const CATALOGS: Record<string, Record<string, unknown>> = {
  en: messages,
  fi,
  fr,
  sv,
};

/**
 * The namespaces the Klingon catalog omits so those pages serve English: the six
 * documents above, plus the shared legal chrome and the attributions credit.
 */
const OMITTED_UNDER_KLINGON = [
  ...LEGAL_DOCUMENTS.map(({ name }) => name),
  "legal",
  "attributions",
];

/** The individual labels Klingon omits for the same reason. */
const OMITTED_LABELS_UNDER_KLINGON = [
  "metadata.pages.privacy",
  "metadata.pages.terms",
  "metadata.pages.antiBullying",
  "metadata.pages.attributions",
  "metadata.pages.robloxPrivacy",
  "metadata.pages.robloxSafeguarding",
  "metadata.pages.robloxTerms",
  "roblox.legal.privacy",
  "roblox.legal.safeguarding",
  "roblox.legal.terms",
  "footer.privacy",
  "footer.terms",
  "footer.antiBullying",
  "footer.attributions",
];

/** The text a reader ends up with, ignoring which parts are links. */
const rendered = (source: string) =>
  policyTextSegments(source)
    .map((segment) => segment.text)
    .join("");

/**
 * Every string anywhere under a message subtree, keyed by its path — the path
 * is what lets one locale's value be lined up against English's.
 */
function flatStrings(node: unknown, prefix = ""): Map<string, string> {
  const found = new Map<string, string>();
  const absorb = (child: unknown, path: string) => {
    for (const [key, value] of flatStrings(child, path)) found.set(key, value);
  };

  if (typeof node === "string") {
    found.set(prefix, node);
  } else if (Array.isArray(node)) {
    node.forEach((child, i) => absorb(child, `${prefix}.${i}`));
  } else if (typeof node === "object" && node !== null) {
    for (const [key, child] of Object.entries(node)) {
      absorb(child, prefix ? `${prefix}.${key}` : key);
    }
  }
  return found;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The tags a string carries, sorted so two strings can be compared directly. */
const tagsIn = (value: string) =>
  [...value.matchAll(/<\/?([A-Za-z][A-Za-z0-9]*)>/g)]
    .map(([, tag]) => tag)
    .sort();

describe("policy cross-reference tags", () => {
  it("leaves untagged copy exactly as written, as a single segment", () => {
    const plain =
      "We review this policy annually. If anything changes, we will say so.";
    expect(policyTextSegments(plain)).toEqual([{ text: plain }]);
  });

  it("turns each known tag into a link to its route, and nothing else", () => {
    for (const [tag, href] of Object.entries(TAG_ROUTES)) {
      const segments = policyTextSegments(`See our <${tag}>Some Policy</${tag}> for more.`);
      expect(segments).toEqual([
        { text: "See our " },
        { text: "Some Policy", href },
        { text: " for more." },
      ]);
    }
  });

  /**
   * The Markdown component's philosophy, applied to the same problem: an
   * unsupported construct shows its words rather than silently deleting a
   * paragraph of somebody's writing. Here the stakes are higher — a tag typo in
   * a binding document must not cost the clause, and must not invent a
   * destination nobody chose.
   */
  it("unwraps an unknown tag to its own words rather than linking or dropping it", () => {
    const segments = policyTextSegments(
      "Read the <linkRobloxPolicy>Programme Privacy Policy</linkRobloxPolicy> first.",
    );
    expect(segments.every((segment) => segment.href === undefined)).toBe(true);
    expect(segments.map((segment) => segment.text).join("")).toBe(
      "Read the Programme Privacy Policy first.",
    );
  });

  it("leaves malformed markup as the literal text it already is", () => {
    for (const broken of [
      "An unclosed <linkPrivacy>Privacy Policy and the rest of the sentence.",
      "A stray < in the middle of a sentence.",
      "A mismatched <linkPrivacy>Privacy Policy</linkTerms> pair.",
    ]) {
      expect(policyTextSegments(broken)).toEqual([{ text: broken }]);
    }
  });

  it("never loses or reorders a word, whatever the tags do", () => {
    for (const source of [
      "",
      "No tags here at all.",
      "<linkPrivacy>Privacy Policy</linkPrivacy>",
      "Two: <linkTerms>Terms</linkTerms> and <linkDiscipline>Discipline</linkDiscipline>.",
      "An <unknownTag>unwrapped</unknownTag> run beside a <linkPrivacy>real</linkPrivacy> one.",
    ]) {
      expect(rendered(source)).toBe(source.replace(/<\/?[A-Za-z][A-Za-z0-9]*>/g, ""));
    }
  });
});

/**
 * **The address a family is told to write to is defined once, in code, and named
 * by the copy.** Spelling it out per document is what produced three different
 * addresses across four legal pages, in five languages, none of them the one the
 * footer showed — and nothing reading English could see it.
 *
 * The completeness script already fails a locale that drops or renames a
 * `{supportEmail}`, because it reads these as the ICU placeholders they are
 * spelled to look like. What it cannot see is a catalog that stops using the
 * placeholder and hardcodes an address again, which is the regression that
 * actually happened. Hence the ratchet below, over every catalog.
 */
describe("the support address in policy copy", () => {
  it("fills the placeholder in with the constant", () => {
    expect(policyTextSegments("Just email {supportEmail} and we'll help.")).toEqual([
      { text: `Just email ${SUPPORT_EMAIL} and we'll help.` },
    ]);
  });

  it("fills one inside a cross-reference link too", () => {
    expect(
      policyTextSegments("See <linkPrivacy>our policy, or {supportEmail}</linkPrivacy>."),
    ).toEqual([
      { text: "See " },
      { text: `our policy, or ${SUPPORT_EMAIL}`, href: ROUTES.privacy },
      { text: "." },
    ]);
  });

  it("leaves a placeholder it does not know exactly as written", () => {
    const typo = "Write to {supportEmial} or {somethingElse}.";
    expect(policyTextSegments(typo)).toEqual([{ text: typo }]);
  });

  it("carries no hardcoded address in any catalog's legal namespaces", () => {
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      for (const { name } of LEGAL_DOCUMENTS) {
        for (const [path, value] of flatStrings(catalog[name])) {
          expect(
            value,
            `${locale}: ${name}.${path} spells an address out — use {supportEmail}`,
          ).not.toMatch(/[a-z0-9._%+-]+@sog\.gg/i);
        }
      }
    }
  });

  it("still shows the address on the pages that promise one", () => {
    // A sample rather than a census: each document's "contact" section is where
    // a reader goes looking, so losing the placeholder there is the failure that
    // matters most.
    for (const contact of [
      messages.privacy.sections.contact.paragraphs[0],
      messages.terms.sections.contact.paragraphs[0],
      messages.discipline.sections.contact.paragraphs[0],
    ]) {
      expect(contact).toContain("{supportEmail}");
      expect(rendered(contact)).toContain(SUPPORT_EMAIL);
    }
  });
});

describe("every catalog's legal namespaces", () => {
  it("uses only tags the renderer knows", () => {
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      for (const { name } of LEGAL_DOCUMENTS) {
        for (const [path, value] of flatStrings(catalog[name])) {
          for (const tag of tagsIn(value)) {
            expect(Object.keys(TAG_ROUTES), `${locale}: ${name}.${path}`).toContain(tag);
          }
        }
      }
    }
  });

  it("never has a document cite itself as a link", () => {
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      for (const { name, ownTag } of LEGAL_DOCUMENTS) {
        for (const [path, value] of flatStrings(catalog[name])) {
          expect(value, `${locale}: ${name}.${path} links to its own page`).not.toContain(
            `<${ownTag}>`,
          );
        }
      }
    }
  });

  it("gives every translation the same cross-links as the English source", () => {
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      if (locale === "en") continue;
      for (const { name } of LEGAL_DOCUMENTS) {
        const translated = flatStrings(catalog[name]);
        for (const [path, source] of flatStrings(messages[name])) {
          expect(
            tagsIn(translated.get(path) ?? ""),
            `${locale}: ${name}.${path}`,
          ).toEqual(tagsIn(source));
        }
      }
    }
  });

  it("actually carries the cross-links the documents promise", () => {
    // A sample rather than a census: enough that deleting the tags wholesale,
    // or losing the subtitle's tag support, fails here.
    expect(messages.robloxTerms.sections.information.blocks[0]).toContain(
      "<linkRobloxPrivacy>Creator Academy Privacy Policy</linkRobloxPrivacy>",
    );
    expect(messages.robloxSafeguarding.subtitle).toContain(
      "<linkDiscipline>Anti-Bullying policy</linkDiscipline>",
    );
    expect(messages.terms.sections.privacy.paragraphs[0]).toContain(
      "<linkPrivacy>Privacy Policy</linkPrivacy>",
    );
  });
});

/**
 * The easter egg stops at the courtroom door: a family may be held to these
 * documents, and two of the attributions are a licence condition, so Klingon
 * serves the English text. It does that by **leaving the keys out** — the
 * message loader lays the Klingon catalog over the English one, so an omitted
 * key resolves to English at runtime and English stays the single source of
 * truth. The loader's own behaviour is pinned beside it; this file pins the
 * catalog's shape.
 *
 * What that buys is only real while the omission is total. A single
 * re-introduced key is worse than the old verbatim-copy convention it replaced:
 * it shadows English with a value nothing keeps in step, in the one place where
 * stale text is a liability rather than a blemish. Hence an absence assertion
 * rather than a parity one, and hence it covers the leaf labels too.
 */
describe("the legal surface under Klingon", () => {
  const klingon: Record<string, unknown> = tlh;

  it("omits the legal namespaces entirely", () => {
    for (const name of OMITTED_UNDER_KLINGON) {
      expect(Object.keys(klingon), `tlh must not carry the "${name}" namespace`).not.toContain(
        name,
      );
    }
  });

  it("omits every label that names one of the documents", () => {
    for (const path of OMITTED_LABELS_UNDER_KLINGON) {
      const segments = path.split(".");
      const leaf = segments.pop();
      const parent = segments.reduce<unknown>(
        (node, key) => (isRecord(node) ? node[key] : undefined),
        klingon,
      );
      expect(Object.keys(isRecord(parent) ? parent : {}), `tlh must not carry "${path}"`)
        .not.toContain(leaf);
    }
  });

  it("still speaks Klingon everywhere else", () => {
    // A canary: if the merge were ever applied the other way round, or the strip
    // ran too wide, these would come back as English.
    expect(tlh.footer.copyright).not.toBe(messages.footer.copyright);
    expect(tlh.roblox.legal.roblox).not.toBe(messages.roblox.legal.roblox);
    expect(Object.keys(tlh.about)).toContain("easterEgg");
  });
});

describe("the rendered page", () => {
  const html = renderToStaticMarkup(
    <PolicyPage
      title="Roblox Programme Terms & Conditions"
      subtitle="This sits alongside our <linkDiscipline>Anti-Bullying policy</linkDiscipline>."
      lastUpdated="Last updated: 31 July 2026"
      intro={{
        heading: "The short version",
        blocks: [
          {
            paragraph:
              "Explained in our <linkRobloxPrivacy>Roblox Programme Privacy Policy</linkRobloxPrivacy>.",
          },
        ],
      }}
      sections={[
        {
          heading: "Safety and supervision",
          blocks: [
            {
              bullets: [
                "Set out in our joint <linkRobloxSafeguarding>Child Safeguarding Policy</linkRobloxSafeguarding>, available upon request.",
              ],
            },
          ],
        },
      ]}
    />,
  );

  it("links from the subtitle, a paragraph and a bullet alike", () => {
    expect(html).toContain(`href="${ROUTES.antiBullying}"`);
    expect(html).toContain(`href="${ROUTES.robloxPrivacy}"`);
    expect(html).toContain(`href="${ROUTES.robloxSafeguarding}"`);
  });

  it("links the document's name and leaves the sentence around it alone", () => {
    expect(html).toContain(
      `<a class="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="${ROUTES.robloxSafeguarding}">Child Safeguarding Policy</a>, available upon request.`,
    );
  });

  it("ships no tag markup to the reader", () => {
    expect(html).not.toContain("&lt;link");
    expect(html).not.toContain("<linkDiscipline>");
  });
});
