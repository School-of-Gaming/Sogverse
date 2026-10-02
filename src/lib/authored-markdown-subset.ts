import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { toHast } from "mdast-util-to-hast";
import { defaultUrlTransform } from "react-markdown";
import type { Nodes } from "hast";
import type { Nodes as MdastNodes } from "mdast";
import {
  MARKDOWN_USE_CASES,
  type MarkdownUseCase,
} from "@/lib/authored-markdown";

/**
 * **Whether a markdown source stays inside a use case's subset**, for a writer
 * that is not the editor — an AI app writing a field through the MCP server,
 * which can type any markdown at all where the editor's toolbar can only
 * produce the subset.
 *
 * The renderers unwrap anything outside the allow-list to its text, which is
 * the right answer for a stored value and the wrong one for a write: the
 * writer would never learn that its table or image is not what readers see.
 * So a write is checked here first and refused, naming each construct.
 *
 * **The check is the renderer's own pipeline, not a restatement of it.** The
 * source is parsed by `remark-parse` and turned into elements by
 * `mdast-util-to-hast` — the two steps inside `react-markdown` — and every
 * element is judged against the use case's `allowedElements`, the list the
 * renderer filters by. Two more things the reader would not see as written are
 * refused with them: raw HTML, which the renderer shows as its own literal
 * text, and a link whose address the renderer's URL transform blanks.
 *
 * **And two a writer reaches for that are not markdown here at all.** The
 * renderer parses CommonMark, so a GFM table or ~~strikethrough~~ is not a
 * construct to unwrap — it is plain text, and readers see its pipes and
 * tildes. A second parse with the GFM extensions finds them, only to name
 * them; it decides nothing else.
 */

/** One construct outside the subset, and the lines it is on. */
export interface MarkdownOutsideSubset {
  /** What it is, in words a writer recognises — "an image (![alt](url))". */
  construct: string;
  /** The 1-based source lines it starts on, in order. */
  lines: number[];
}

/**
 * Every element `remark-parse` and `mdast-util-to-hast` can produce from
 * CommonMark, named for a writer, with the syntax that makes it. A test holds
 * that every element any use case allows is named here.
 *
 * Exported for that test alone.
 */
export const MARKDOWN_ELEMENT_NAMES: Readonly<
  Partial<Record<string, { name: string; plural: string }>>
> = {
  p: { name: "a paragraph", plural: "paragraphs" },
  strong: { name: "bold (**text**)", plural: "bold (**text**)" },
  em: { name: "italic (*text*)", plural: "italic (*text*)" },
  ul: { name: "a bulleted list (- item)", plural: "bulleted lists (- item)" },
  ol: { name: "a numbered list (1. item)", plural: "numbered lists (1. item)" },
  li: { name: "a list item", plural: "list items" },
  br: {
    name: "a hard line break (a line ending in a backslash)",
    plural: "hard line breaks (a line ending in a backslash)",
  },
  h1: { name: "a level-1 heading (#)", plural: "level-1 headings (#)" },
  h2: { name: "a level-2 heading (##)", plural: "level-2 headings (##)" },
  h3: { name: "a level-3 heading (###)", plural: "level-3 headings (###)" },
  h4: { name: "a level-4 heading (####)", plural: "level-4 headings (####)" },
  h5: { name: "a level-5 heading (#####)", plural: "level-5 headings (#####)" },
  h6: { name: "a level-6 heading (######)", plural: "level-6 headings (######)" },
  a: { name: "a link ([label](url))", plural: "links ([label](url))" },
  img: { name: "an image (![alt](url))", plural: "images (![alt](url))" },
  pre: { name: "a code block", plural: "code blocks" },
  code: { name: "inline code (`code`)", plural: "inline code (`code`)" },
  blockquote: { name: "a block quote (> text)", plural: "block quotes (> text)" },
  hr: { name: "a horizontal rule (---)", plural: "horizontal rules (---)" },
};

/** The elements a use case keeps that a writer names — a list item goes with its list. */
function namedAllowedElements(useCase: MarkdownUseCase): string[] {
  return MARKDOWN_USE_CASES[useCase].allowedElements.filter(
    (element) => element !== "li",
  );
}

/**
 * The use case's subset in words — "paragraphs, bold (**text**), …, and links
 * ([label](url))" — for a tool's description, so what an AI app is told it may
 * write is exactly what the check below lets through.
 */
export function describeMarkdownSubset(useCase: MarkdownUseCase): string {
  const phrases = namedAllowedElements(useCase).map(
    (element) => MARKDOWN_ELEMENT_NAMES[element]?.plural ?? `<${element}>`,
  );
  return phrases.length < 2
    ? phrases.join("")
    : `${phrases.slice(0, -1).join(", ")} and ${phrases.at(-1)}`;
}

const parser = unified().use(remarkParse);
// Double tildes only: "~5 to ~10 minutes" is prose, and readers see it as written.
const gfmParser = unified().use(remarkParse).use(remarkGfm, { singleTilde: false });

/** The GFM constructs the renderer shows as literal text, by their mdast node type. */
const LITERAL_GFM: Readonly<Partial<Record<string, string>>> = {
  table: "a table (| cell |), which readers would see as its pipes",
  delete: "strikethrough (~~text~~), which readers would see as its tildes",
};

/**
 * The constructs in `markdown` that a reader of `useCase` would not see as
 * written, in the order they first appear; empty when the source is inside
 * the subset.
 */
export function markdownOutsideSubset(
  markdown: string,
  useCase: MarkdownUseCase,
): MarkdownOutsideSubset[] {
  const allowed = new Set(MARKDOWN_USE_CASES[useCase].allowedElements);
  // `allowDangerousHtml` keeps raw HTML in the tree as `raw` nodes, as
  // `react-markdown` does, so it can be named rather than silently dropped.
  const tree = toHast(parser.parse(markdown), { allowDangerousHtml: true });
  const found = new Map<string, number[]>();

  const note = (construct: string, node: Nodes | MdastNodes) => {
    const line = node.position?.start.line;
    const lines = found.get(construct) ?? [];
    if (line !== undefined && !lines.includes(line)) lines.push(line);
    found.set(construct, lines);
  };

  const visit = (node: Nodes) => {
    if (node.type === "raw") {
      note("raw HTML (readers would see the tags as text)", node);
      return;
    }
    if (node.type === "element") {
      if (!allowed.has(node.tagName)) {
        note(MARKDOWN_ELEMENT_NAMES[node.tagName]?.name ?? `<${node.tagName}>`, node);
        // A code block's `code` is the block itself, not a second construct.
        if (node.tagName === "pre") return;
      } else if (node.tagName === "a") {
        const href = node.properties.href;
        if (typeof href === "string" && href !== "" && defaultUrlTransform(href) === "") {
          note(
            `a link to "${href}", an address readers' pages strip (use http, https, mailto or a relative address)`,
            node,
          );
        }
      }
    }
    if ("children" in node) {
      for (const child of node.children) visit(child);
    }
  };
  visit(tree);

  const visitGfm = (node: MdastNodes) => {
    const construct = LITERAL_GFM[node.type];
    if (construct !== undefined) {
      note(construct, node);
      return;
    }
    if ("children" in node) {
      for (const child of node.children) visitGfm(child);
    }
  };
  visitGfm(gfmParser.parse(markdown));

  // The second parse's finds go in among the first's by where they start.
  return [...found]
    .map(([construct, lines]) => ({ construct, lines }))
    .sort((a, b) => (a.lines[0] ?? 0) - (b.lines[0] ?? 0));
}
