import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import messages from "@/../messages/en.json";
import { PolicyPage } from "@/components/legal/policy-page";
import { policyTextSegments } from "@/components/legal/policy-content";
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

/** The six documents: the message subtree each one's copy lives in, and its own tag. */
const LEGAL_DOCUMENTS = [
  { name: "privacy", copy: messages.privacy, ownTag: "linkPrivacy" },
  { name: "terms", copy: messages.terms, ownTag: "linkTerms" },
  { name: "discipline", copy: messages.discipline, ownTag: "linkDiscipline" },
  {
    name: "robloxPrivacy",
    copy: messages.robloxPrivacy,
    ownTag: "linkRobloxPrivacy",
  },
  {
    name: "robloxSafeguarding",
    copy: messages.robloxSafeguarding,
    ownTag: "linkRobloxSafeguarding",
  },
  { name: "robloxTerms", copy: messages.robloxTerms, ownTag: "linkRobloxTerms" },
] as const;

/** The text a reader ends up with, ignoring which parts are links. */
const rendered = (source: string) =>
  policyTextSegments(source)
    .map((segment) => segment.text)
    .join("");

/** Every string anywhere under a message subtree, in reading order. */
function stringsIn(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(stringsIn);
  if (typeof node === "object" && node !== null) {
    return Object.values(node).flatMap(stringsIn);
  }
  return [];
}

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

describe("the English catalog's legal namespaces", () => {
  it("uses only tags the renderer knows", () => {
    for (const { name, copy } of LEGAL_DOCUMENTS) {
      for (const value of stringsIn(copy)) {
        for (const [, tag] of value.matchAll(/<\/?([A-Za-z][A-Za-z0-9]*)>/g)) {
          expect(Object.keys(TAG_ROUTES), `${name}: ${value}`).toContain(tag);
        }
      }
    }
  });

  it("never has a document cite itself as a link", () => {
    for (const { name, copy, ownTag } of LEGAL_DOCUMENTS) {
      for (const value of stringsIn(copy)) {
        expect(value, `${name} links to its own page`).not.toContain(
          `<${ownTag}>`,
        );
      }
    }
  });

  it("actually carries the cross-links the documents promise", () => {
    // A sample rather than a census: enough that deleting the tags wholesale,
    // or losing the subtitle's tag support, fails here.
    expect(messages.robloxTerms.sections.information.blocks[0]).toContain(
      "<linkRobloxPrivacy>Roblox Programme Privacy Policy</linkRobloxPrivacy>",
    );
    expect(messages.robloxSafeguarding.subtitle).toContain(
      "<linkDiscipline>Anti-Bullying policy</linkDiscipline>",
    );
    expect(messages.terms.sections.privacy.paragraphs[0]).toContain(
      "<linkPrivacy>Privacy Policy</linkPrivacy>",
    );
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
