import { describe, expect, it } from "vitest";
import en from "@/../messages/en.json";
import fi from "@/../messages/fi.json";
import sv from "@/../messages/sv.json";
import fr from "@/../messages/fr.json";
import tlh from "@/../messages/tlh.json";
import { FAQ_ANSWER_TAGS } from "@/components/ui/faq-answer";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";

/**
 * Every FAQ answer, in every catalog, is well-formed tag markup.
 *
 * The renderer hands each answer's message to `t.rich` with the shared tag
 * vocabulary, which means an answer that forgot its tags does not fail — it
 * renders as bare text inside the answer container and looks very nearly
 * right. That silence is the whole reason this file exists: the rule "answers
 * are tagged" has no runtime consequence to discover it being broken, so it
 * gets a test instead of a comment.
 *
 * The stakes are higher for the tags that are *not* decoration. An unbalanced
 * inline tag — a translator dropping a `</linkPrivacy>` — is not a styling
 * slip: `t.rich` throws on it, so that one locale's page stops rendering.
 * Those tags belong to the Programme's copy alone, so the allow-list is per
 * surface rather than global, and a link tag appearing anywhere else is itself
 * a finding.
 *
 * The surfaces are enumerated from the catalogs rather than from the
 * components' key arrays, so a question added to a catalog is covered the
 * moment it is added, including one added ahead of the array that will render
 * it. The arrays themselves are already compiler-checked against the catalog.
 */

const CATALOGS = { en, fi, sv, fr, tlh } as const;

type Catalog = (typeof CATALOGS)[keyof typeof CATALOGS];

/** One question. `roblox.faq` entries may carry more; nothing here reads it. */
interface FaqEntry {
  question: string;
  answer: string;
}

/**
 * The block tags, each naming the child tag it may contain. A block with no
 * children holds text (and its surface's inline tags) directly.
 *
 * Asserted against the renderer's own vocabulary below, so a tag added to
 * `FAQ_ANSWER_TAGS` without a rule here fails the suite rather than going
 * silently unvalidated.
 */
const BLOCK_CHILDREN: Record<string, readonly string[]> = {
  p: [],
  steps: ["step"],
  list: ["item"],
};

interface Surface {
  label: string;
  get: (c: Catalog) => Record<string, FaqEntry>;
  /** Inline tags this surface's own component supplies, beyond the blocks. */
  inline: readonly string[];
}

const SURFACES: readonly Surface[] = [
  { label: "about.faq", get: (c) => c.about.faq.items, inline: [] },
  { label: "parent.helpFaq", get: (c) => c.parent.helpFaq.items, inline: [] },
  { label: "gamer.helpFaq", get: (c) => c.gamer.helpFaq.items, inline: [] },
  { label: "gedu.helpFaq", get: (c) => c.gedu.helpFaq.items, inline: [] },
  {
    // The Programme FAQ additionally carries two `answer2` keys, and those stay
    // deliberately untagged — its component renders each into a paragraph of
    // its own choosing, one of them a styled aside. Only `answer` is block
    // markup, on every surface, so only `answer` is parsed here.
    label: "roblox.faq",
    get: (c) => c.roblox.faq.items,
    inline: ["linkPrivacy", "linkSafeguarding", "linkEmail"],
  },
];

/**
 * Walk an answer's markup, asserting that it is renderable.
 *
 * Returns the top-level blocks in order, and throws on anything `t.rich` would
 * reject or mis-render: an unknown tag, a tag closing the wrong element, a
 * block left open, an empty block, text loose at the top level, and text loose
 * inside a list, where it would land as a bare node between the `<li>`s.
 */
function parseBlocks(answer: string, inline: readonly string[]): string[] {
  const token = /<(\/?)([A-Za-z][A-Za-z0-9]*)>/g;
  const blocks: string[] = [];
  /** Open elements, outermost first, and whether each has seen content. */
  const stack: string[] = [];
  const filled: boolean[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  const top = () => (stack.length === 0 ? null : stack[stack.length - 1]);
  /** Can this element hold text and inline tags, rather than only child tags? */
  const holdsText = (tag: string) =>
    !(tag in BLOCK_CHILDREN) || BLOCK_CHILDREN[tag].length === 0;

  while ((match = token.exec(answer)) !== null) {
    const [raw, slash, tag] = match;
    const between = answer.slice(cursor, match.index);
    cursor = match.index + raw.length;
    const parent = top();

    if (between.trim() !== "") {
      if (parent === null) {
        throw new Error(`loose text outside a block: ${JSON.stringify(between.trim())}`);
      }
      if (!holdsText(parent)) {
        throw new Error(`loose text inside <${parent}>: ${JSON.stringify(between.trim())}`);
      }
      filled[filled.length - 1] = true;
    }

    if (slash !== "/") {
      if (parent === null) {
        if (!(tag in BLOCK_CHILDREN)) throw new Error(`<${tag}> is not a block tag`);
        blocks.push(tag);
      } else if (!holdsText(parent)) {
        if (!BLOCK_CHILDREN[parent].includes(tag)) {
          throw new Error(`<${tag}> is not allowed inside <${parent}>`);
        }
      } else if (!inline.includes(tag)) {
        throw new Error(`<${tag}> is not an inline tag on this surface`);
      }
      stack.push(tag);
      filled.push(false);
      continue;
    }

    if (parent === null) throw new Error(`</${tag}> closes nothing`);
    if (tag !== parent) throw new Error(`</${tag}> closes <${parent}>`);
    if (filled.pop() !== true) throw new Error(`<${tag}> is empty`);
    stack.pop();
    // An element that held something counts as content for the one around it.
    if (filled.length > 0) filled[filled.length - 1] = true;
  }

  if (stack.length > 0) throw new Error(`<${stack[stack.length - 1]}> is never closed`);
  if (answer.slice(cursor).trim() !== "") throw new Error("trailing text outside a block");
  if (blocks.length === 0) throw new Error("no blocks at all");
  return blocks;
}

describe("FAQ answers", () => {
  it("covers every supported locale", () => {
    expect(Object.keys(CATALOGS).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it("has a rule for every tag the renderer supplies", () => {
    const known = new Set<string>();
    for (const [block, children] of Object.entries(BLOCK_CHILDREN)) {
      known.add(block);
      for (const child of children) known.add(child);
    }
    expect([...known].sort()).toEqual(Object.keys(FAQ_ANSWER_TAGS).sort());
  });

  for (const { label, get, inline } of SURFACES) {
    describe(label, () => {
      const keys = Object.keys(get(CATALOGS.en));

      it("has questions to ask", () => {
        expect(keys.length).toBeGreaterThan(0);
      });

      it("carries the same keys in every locale", () => {
        for (const [locale, catalog] of Object.entries(CATALOGS)) {
          expect(Object.keys(get(catalog)).sort(), locale).toEqual([...keys].sort());
        }
      });

      for (const key of keys) {
        it(`${key} is well-formed in every locale`, () => {
          for (const [locale, catalog] of Object.entries(CATALOGS)) {
            const entry = get(catalog)[key];
            expect(entry, `${locale} ${label}.${key}`).toBeDefined();
            expect(entry.question.trim(), `${locale} question`).not.toBe("");
            expect(
              () => parseBlocks(entry.answer, inline),
              `${locale} ${label}.${key}`,
            ).not.toThrow();
          }
        });
      }
    });
  }
});

/**
 * The parser is the whole guarantee, so it is pinned against the malformed
 * shapes a hand-edited catalog actually produces. Several of these passed an
 * earlier version of it.
 */
describe("parseBlocks rejects", () => {
  const bad: Record<string, string> = {
    "an untagged answer": "Just some words.",
    "a stray close": "<p>a</p></p>",
    "an unclosed block": "<p>a",
    "a mismatched close": "<p>a</steps>",
    "an empty paragraph": "<p></p>",
    "an empty list": "<steps></steps>",
    "an empty item": "<list><item></item></list>",
    "text loose at the top level": "<p>a</p>stray<p>b</p>",
    "text loose before a list item": "<list>oops<item>a</item></list>",
    "text loose between list items": "<list><item>a</item>oops<item>b</item></list>",
    "a nested block": "<p><p>a</p></p>",
    "an unknown tag": "<blockquote>a</blockquote>",
    "an unknown inline tag": "<p>a <b>b</b></p>",
    "a list item outside its list": "<p><item>a</item></p>",
    "a step inside the wrong list": "<list><step>a</step></list>",
  };

  for (const [what, markup] of Object.entries(bad)) {
    it(what, () => {
      expect(() => parseBlocks(markup, [])).toThrow();
    });
  }

  it("accepts the shapes the copy actually uses", () => {
    expect(() => parseBlocks("<p>a</p><p>b</p>", [])).not.toThrow();
    expect(() => parseBlocks("<p>a</p><steps><step>x</step></steps>", [])).not.toThrow();
    expect(() => parseBlocks("<list><item>x</item><item>y</item></list>", [])).not.toThrow();
  });

  it("gates an inline tag on the surface that supplies it", () => {
    const markup = "<p>a <linkPrivacy>b</linkPrivacy></p>";
    expect(() => parseBlocks(markup, [])).toThrow();
    expect(() => parseBlocks(markup, ["linkPrivacy"])).not.toThrow();
  });

  it("an unbalanced inline tag, which throws at render", () => {
    expect(() => parseBlocks("<p>a <linkPrivacy>b</p>", ["linkPrivacy"])).toThrow();
  });
});
