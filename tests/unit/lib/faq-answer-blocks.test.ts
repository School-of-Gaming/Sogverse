import { describe, expect, it } from "vitest";
import en from "@/../messages/en.json";
import fi from "@/../messages/fi.json";
import sv from "@/../messages/sv.json";
import fr from "@/../messages/fr.json";
import tlh from "@/../messages/tlh.json";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";

/**
 * Every FAQ answer, in every catalog, is block-structured markup.
 *
 * The renderer hands each answer's message to `t.rich` with the shared tag
 * vocabulary, which means an answer that forgot its tags does not fail — it
 * renders as bare text inside the answer container and looks very nearly
 * right. That silence is the whole reason this file exists: the rule "answers
 * are tagged" has no runtime consequence to discover it being broken, so it
 * gets a test instead of a comment.
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
 * Where the FAQ answers live. Each is a map of key -> { question, answer }.
 *
 * The Programme FAQ additionally carries two `answer2` keys, and those stay
 * deliberately untagged — its component renders each into a paragraph of its
 * own choosing, one of them a styled aside. Only `answer` is block markup, on
 * every surface, so only `answer` is parsed here.
 */
const SURFACES: readonly (readonly [string, (c: Catalog) => Record<string, FaqEntry>])[] = [
  ["about.faq", (c) => c.about.faq.items],
  ["parent.helpFaq", (c) => c.parent.helpFaq.items],
  ["gamer.helpFaq", (c) => c.gamer.helpFaq.items],
  ["gedu.helpFaq", (c) => c.gedu.helpFaq.items],
  ["roblox.faq", (c) => c.roblox.faq.items],
];

/** The tags `FAQ_ANSWER_TAGS` supplies, and the only ones an answer may use. */
const BLOCKS = new Set(["p", "steps", "list"]);
const CHILDREN: Record<string, readonly string[]> = {
  steps: ["step"],
  list: ["item"],
  p: [],
};

/**
 * Parse an answer into its top-level blocks, asserting as it goes that the
 * markup is well formed: every tag is one we render, every block is closed,
 * list items appear only inside their own list, and no text sits loose between
 * blocks where it would render unstyled.
 */
function parseBlocks(answer: string): string[] {
  const token = /<(\/?)([a-z]+)>/g;
  const blocks: string[] = [];
  let open: string | null = null;
  let openChild: string | null = null;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = token.exec(answer)) !== null) {
    const [raw, slash, tag] = match;
    const between = answer.slice(cursor, match.index);
    cursor = match.index + raw.length;
    const closing = slash === "/";

    if (open === null && between.trim() !== "") {
      throw new Error(`loose text outside a block: ${JSON.stringify(between.trim())}`);
    }

    if (!closing) {
      if (open === null) {
        if (!BLOCKS.has(tag)) {
          throw new Error(`<${tag}> is not a block tag`);
        }
        open = tag;
        blocks.push(tag);
      } else if (openChild === null) {
        if (!CHILDREN[open].includes(tag)) {
          throw new Error(`<${tag}> is not allowed inside <${open}>`);
        }
        openChild = tag;
      } else {
        throw new Error(`<${tag}> nested too deep, inside <${openChild}>`);
      }
      continue;
    }

    if (openChild !== null) {
      if (tag !== openChild) throw new Error(`</${tag}> closes nothing`);
      openChild = null;
    } else if (open !== null) {
      if (tag !== open) throw new Error(`</${tag}> closes nothing`);
      // A list whose items never opened would render an empty bullet run.
      if (CHILDREN[open].length > 0 && between.trim() !== "") {
        throw new Error(`loose text inside <${open}>`);
      }
      open = null;
    } else {
      throw new Error(`</${tag}> closes nothing`);
    }
  }

  if (open !== null) throw new Error(`<${open}> is never closed`);
  if (answer.slice(cursor).trim() !== "") throw new Error("trailing text outside a block");
  return blocks;
}

describe("FAQ answers", () => {
  it("covers every supported locale", () => {
    expect(Object.keys(CATALOGS).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  for (const [label, get] of SURFACES) {
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
        it(`${key} is well-formed blocks in every locale`, () => {
          for (const [locale, catalog] of Object.entries(CATALOGS)) {
            const entry = get(catalog)[key];
            expect(entry, `${locale} ${label}.${key}`).toBeDefined();
            expect(entry.question.trim(), `${locale} question`).not.toBe("");
            expect(
              () => parseBlocks(entry.answer),
              `${locale} ${label}.${key}`,
            ).not.toThrow();
            expect(parseBlocks(entry.answer).length, `${locale} block count`).toBeGreaterThan(0);
          }
        });
      }
    });
  }
});
