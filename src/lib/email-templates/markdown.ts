import { unified } from "unified";
import remarkParse from "remark-parse";
import type { List, ListItem, PhrasingContent, RootContent } from "mdast";
import { DARK_THEME } from "@/lib/constants/colors";
import { escapeHtml } from "./utils";

/**
 * Renders stored markdown — a gedu's session report — as the inline-styled HTML
 * fragment an email can carry.
 *
 * **Same parser as the app, same subset as the app.** The source is parsed by
 * `remark-parse`, which is the parser inside `react-markdown`, so a report
 * cannot mean one thing on the family's page and another in their inbox. The
 * elements emitted are exactly the in-app `feed` allow-list (see the `Markdown`
 * component under `components/ui/`, and the parity test next to this file):
 * paragraphs, three heading levels, bold, italic, lists and line breaks.
 * Everything outside that set is **unwrapped to its text rather than dropped**,
 * which is the app's rule too — a pasted table still shows its words, a deeper
 * heading reads as a paragraph, a code span reads as plain text.
 *
 * **A link renders as its label and nothing else.** A report is written by a
 * gedu and read by a family, so a link in one is this platform pointing a
 * child's parent somewhere it does not control; the app refuses to render one,
 * and a mail that did would be the same sentence meaning two different things
 * depending on where it was read. Images have no text to unwrap to and vanish;
 * raw HTML in the source is never emitted.
 *
 * **Every character of text is escaped.** The source is typed by a user, and
 * the output is spliced straight into the mail's HTML, so this is the one seam
 * where a stray `<` would become markup.
 *
 * Output is a string of inline-styled elements, not a React render: this
 * module sits behind the template registry, which a client page imports, so it
 * has to be cheap to bundle and must not reach for `react-dom/server`.
 */

/**
 * The tags this renderer can emit. Held equal to the app's `FEED_ELEMENTS` by a
 * unit test, so widening one side without the other fails the build.
 */
export const EMAIL_MARKDOWN_ELEMENTS = [
  "p",
  "h1",
  "h2",
  "h3",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "br",
];

const parser = unified().use(remarkParse);

export function renderMarkdownForEmail(markdown: string): string {
  const tree = parser.parse(markdown);
  return renderBlocks(tree.children);
}

/**
 * Where a block sits among its siblings. Email clients have no `:first-child`
 * to lean on, so the margins that make the rhythm — no gap above the first
 * block, none below the last, air above a heading otherwise — are decided here
 * and written inline.
 */
interface Position {
  first: boolean;
  last: boolean;
}

const TEXT_STYLE = `color:${DARK_THEME.foreground};font-size:14px;line-height:1.6;`;

function margin(top: number, bottom: number, { first, last }: Position): string {
  return `margin:${first ? 0 : top}px 0 ${last ? 0 : bottom}px;`;
}

function renderBlocks(nodes: RootContent[]): string {
  const visible = flatten(nodes).filter((node) => !emitsNothing(node));
  return visible
    .map((node, i) =>
      renderBlock(node, { first: i === 0, last: i === visible.length - 1 }),
    )
    .join("");
}

/**
 * A blockquote is unwrapped to the blocks inside it — the app drops the quote
 * and keeps the paragraphs — so its children take their place among the
 * siblings *before* positions are assigned, or the first paragraph of a quote
 * would carry a gap it no longer has a reason for.
 */
function flatten(nodes: RootContent[]): RootContent[] {
  return nodes.flatMap((node) =>
    node.type === "blockquote" ? flatten(node.children) : [node],
  );
}

/** Nodes with no text to unwrap to, so they leave no block behind. */
function emitsNothing(node: RootContent): boolean {
  switch (node.type) {
    case "html":
    case "thematicBreak":
    case "definition":
    case "footnoteDefinition":
    case "yaml":
    case "image":
    case "imageReference":
    case "footnoteReference":
      return true;
    default:
      return false;
  }
}

function renderBlock(node: RootContent, pos: Position): string {
  switch (node.type) {
    case "paragraph":
      return paragraph(renderInline(node.children), pos);
    case "heading": {
      const { depth } = node;
      return depth === 1 || depth === 2 || depth === 3
        ? heading(depth, renderInline(node.children), pos)
        : // The editor stops at three levels; a deeper one reads as a paragraph,
          // which is what unwrapping it to its text amounts to.
          paragraph(renderInline(node.children), pos);
    }
    case "list":
      return list(node, pos);
    case "code":
      return paragraph(escapeHtml(node.value), pos);
    case "table":
      // Not reachable from the editor (no GFM), kept for the unwrap rule: the
      // cells' words survive, one row per line.
      return paragraph(
        node.children
          .map((row) =>
            row.children.map((cell) => renderInline(cell.children)).join(" "),
          )
          .join("<br />"),
        pos,
      );
    case "listItem":
    case "tableRow":
    case "tableCell":
      // Only meaningful inside their parents, which render them there; at the
      // top level they have nothing to be part of, so their text is kept.
      return paragraph(renderBlocksInline(node.children), pos);
    case "blockquote":
      // Flattened away before this point; kept for exhaustiveness.
      return renderBlocks(node.children);
    case "html":
    case "thematicBreak":
    case "definition":
    case "footnoteDefinition":
    case "yaml":
      return "";
    default:
      // A phrasing node at block level — the parser does not produce these, but
      // the type admits them, and the unwrap rule says its text is kept.
      return paragraph(renderInline([node]), pos);
  }
}

/** Children of an orphaned container, rendered as one run of inline text. */
function renderBlocksInline(nodes: RootContent[]): string {
  return nodes
    .map((child) =>
      "children" in child
        ? renderBlocksInline(child.children as RootContent[])
        : "value" in child
          ? escapeHtml(child.value)
          : "",
    )
    .join(" ");
}

function paragraph(inner: string, pos: Position): string {
  return `<p style="${margin(0, 16, pos)}${TEXT_STYLE}">${inner}</p>`;
}

/**
 * Three levels, three visible sizes — the editor offers a title, a heading and
 * a subheading, and a writer has to be able to see which one they picked. The
 * top level matches the size the shell's own heading helper uses, so a report's
 * title sits level with the rest of the mail rather than shouting over it; the
 * third is body-sized and muted, as it is in the app.
 */
function heading(depth: 1 | 2 | 3, inner: string, pos: Position): string {
  const size = depth === 1 ? 18 : depth === 2 ? 16 : 14;
  const color = depth === 3 ? DARK_THEME.mutedFg : DARK_THEME.foreground;
  return `<h${depth} style="${margin(24, 8, pos)}font-size:${size}px;font-weight:bold;line-height:1.4;color:${color};">${inner}</h${depth}>`;
}

/**
 * Mirrors the shell's bullet-list helper: padding on the list so the markers
 * stay inside the card, and a small gap between items.
 *
 * A *tight* list (no blank lines between items) renders each item's paragraph
 * as bare text, the way the app does — wrapping it in `<p>` would give every
 * bullet a paragraph's bottom margin.
 */
function list(node: List, pos: Position): string {
  const loose = node.spread || node.children.some((item) => item.spread);
  const tag = node.ordered ? "ol" : "ul";
  const start =
    node.ordered && node.start !== null && node.start !== undefined && node.start !== 1
      ? ` start="${node.start}"`
      : "";
  const items = node.children
    .map((item) => `<li style="margin:0 0 8px;">${listItem(item, loose)}</li>`)
    .join("");
  return `<${tag}${start} style="${margin(0, 16, pos)}padding-left:20px;${TEXT_STYLE}">${items}</${tag}>`;
}

function listItem(item: ListItem, loose: boolean): string {
  return item.children
    .map((child, i) =>
      child.type === "paragraph" && !loose
        ? renderInline(child.children)
        : renderBlock(child, { first: i === 0, last: i === item.children.length - 1 }),
    )
    .join("");
}

function renderInline(nodes: PhrasingContent[]): string {
  return nodes.map(renderPhrasing).join("");
}

function renderPhrasing(node: PhrasingContent): string {
  switch (node.type) {
    case "text":
      return escapeHtml(node.value);
    case "strong":
      return `<strong>${renderInline(node.children)}</strong>`;
    case "emphasis":
      return `<em>${renderInline(node.children)}</em>`;
    case "break":
      return "<br />";
    case "inlineCode":
      return escapeHtml(node.value);
    case "link":
    case "linkReference":
    case "delete":
      // Unwrapped: the label stays, the destination (or the strike) goes.
      return renderInline(node.children);
    case "image":
    case "imageReference":
    case "footnoteReference":
    case "html":
      return "";
  }
}
