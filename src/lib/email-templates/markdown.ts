import { unified } from "unified";
import remarkParse from "remark-parse";
import { defaultUrlTransform } from "react-markdown";
import type {
  Definition,
  List,
  ListItem,
  Nodes,
  PhrasingContent,
  RootContent,
} from "mdast";
import {
  MARKDOWN_CONTAINER,
  MARKDOWN_LOOK,
  MARKDOWN_USE_CASES,
  OUTLINE_TAGS,
  type MarkdownLook,
  type MarkdownUseCase,
} from "@/lib/authored-markdown";
import { mailOwnSiteHref } from "@/lib/links/own-site";
import { defuseAutolinks, escapeHtml } from "./utils";

/**
 * Renders stored markdown — a gedu's session report, or any other authored
 * field — as the inline-styled HTML fragment an email can carry.
 *
 * **One document, two media.** The look, the use cases with their feature
 * flags, allow-lists and outline tags are the app's own, read from
 * `lib/authored-markdown`, so a field renders here exactly as the in-app
 * `Markdown` component renders it under the same use case: the same tags in
 * the same order, the same words, the same links kept or unwrapped, and every
 * element's values written inline where the app paints classes. The source is
 * parsed by `remark-parse`, the parser inside `react-markdown`, and an element
 * outside the use case's allow-list is
 * unwrapped to its contents as the app unwraps it — a deeper heading or a code
 * block leaves its bare text in the container, raw HTML in the source reads as
 * its own literal (escaped) text, an image or a rule leaves nothing.
 *
 * **Links follow the `links` flag, and so does their degradation.** A use case
 * without it (a report: staff-authored, family-read) renders a link as its
 * label and nothing else. A use case with it keeps an anchor only where the
 * href survives `react-markdown`'s own URL transform — the one function the
 * app calls — and degrades a blanked one to its label, exactly as the app does.
 * **Nothing in the text is left for a mail client to turn into a link either**:
 * every major client linkifies anything *shaped* like an address in running
 * text, which the browser does not, so address-shaped runs are defused with a
 * zero-width word joiner after each dot — the text reads identically, and no
 * client's linkifier recognises it.
 *
 * **Every character of text is escaped.** The source is typed by a user and
 * the output is spliced straight into the mail's HTML, so this is the one seam
 * where a stray `<` would become markup.
 *
 * Output is a string rather than a React render: this module sits behind the
 * template registry, which a client page imports, so it has to be cheap to
 * bundle and must not reach for `react-dom/server`.
 */
export function renderMarkdownForEmail(
  markdown: string,
  useCase: MarkdownUseCase,
): string {
  const tree = parser.parse(markdown);
  const { allowedElements, features, outline } = MARKDOWN_USE_CASES[useCase];
  const context: Context = {
    allowed: new Set(allowedElements),
    links: features.links,
    tags: OUTLINE_TAGS[outline],
    definitions: collectDefinitions(tree),
  };
  return `<div style="${css(textDeclarations(MARKDOWN_CONTAINER))}">${renderTopLevel(tree.children, context)}</div>`;
}

const parser = unified().use(remarkParse);

interface Context {
  allowed: ReadonlySet<string>;
  /** The use case's `links` flag. */
  links: boolean;
  tags: (typeof OUTLINE_TAGS)[keyof typeof OUTLINE_TAGS];
  /** Link reference definitions, by identifier, so `[label][ref]` resolves as it does in the app. */
  definitions: ReadonlyMap<string, Definition>;
}

function collectDefinitions(node: Nodes, found = new Map<string, Definition>()) {
  if (node.type === "definition" && !found.has(node.identifier)) {
    found.set(node.identifier, node);
  }
  if ("children" in node) {
    for (const child of node.children) collectDefinitions(child, found);
  }
  return found;
}

// ------------------------------------------------------------------- styles

/** A declaration list, in the order it is written. */
type Declarations = [property: string, value: string][];

function css(declarations: Declarations): string {
  return declarations.map(([property, value]) => `${property}:${value};`).join("");
}

/**
 * The weight a mail asks for. The mail face draws 400 and 700 only, so a
 * weight between them lands where a browser's own font matching would put it:
 * above 500 on the heavier face, 500 and below on the lighter.
 */
export function mailWeight(weight: number): 400 | 700 {
  return weight > 500 ? 700 : 400;
}

/** The text half of a look: size, leading, weight, ink, decoration. */
function textDeclarations(look: MarkdownLook): Declarations {
  const out: Declarations = [];
  if (look.fontSize !== undefined) out.push(["font-size", `${look.fontSize}px`]);
  if (look.lineHeight !== undefined) out.push(["line-height", `${look.lineHeight}`]);
  if (look.fontWeight !== undefined) out.push(["font-weight", `${mailWeight(look.fontWeight)}`]);
  if (look.color !== undefined) out.push(["color", look.color]);
  if (look.underline === true) out.push(["text-decoration", "underline"]);
  if (look.underlineOffset !== undefined) {
    out.push(["text-underline-offset", `${look.underlineOffset}px`]);
  }
  return out;
}

/**
 * A block's whole style. The container's text values are restated on every
 * block rather than inherited from the wrapper, because Outlook's Word engine
 * gives a `<p>` or a heading its own default face size and colour instead of
 * the parent's; the element's look then overrides them. The margin is the top
 * one alone — every other side is zeroed, since a mail client's own heading
 * and paragraph margins are not the app's.
 */
function blockStyle(look: MarkdownLook, top: number): string {
  const box: Declarations =
    look.indent === undefined
      ? [["margin", `${top}px 0 0`]]
      : [
          ["margin", `${top}px 0 0 ${look.indent}px`],
          ["padding", "0"],
        ];
  if (look.listStyle !== undefined) box.push(["list-style-type", look.listStyle]);
  const text = new Map(textDeclarations(MARKDOWN_CONTAINER));
  for (const [property, value] of textDeclarations(look)) text.set(property, value);
  return css([...box, ...text]);
}

// ------------------------------------------------------------------- blocks

/**
 * The container's children. Only the first *element* among them is flush —
 * the app's reset is a `:first-child` rule, which a mail cannot express and
 * which ignores bare text — so the flag stays up until markup has been emitted.
 */
function renderTopLevel(nodes: RootContent[], context: Context): string {
  let html = "";
  for (const node of nodes) {
    const block = renderBlock(node, context, !html.includes("<"));
    if (block !== "") html += html === "" ? block : `\n${block}`;
  }
  return html;
}

/** Blocks inside an unwrapped quote: none of them is flush. */
function renderBlocks(nodes: RootContent[], context: Context, inItem: boolean): string {
  return nodes
    .map((node) => renderBlock(node, context, false, inItem))
    .filter((block) => block !== "")
    .join("\n");
}

/**
 * `inItem` is a block inside a list item, where a list is a sub-list. An
 * unwrapped quote passes it through: the app unwraps the quote too, so a list
 * in it still sits in the item.
 */
function renderBlock(
  node: RootContent,
  context: Context,
  flush: boolean,
  inItem = false,
): string {
  switch (node.type) {
    case "paragraph":
      return element("p", "p", MARKDOWN_LOOK.p, renderInline(node.children, context), context, flush);
    case "heading": {
      const level = `h${node.depth}`;
      const inner = renderInline(node.children, context);
      return level === "h1" || level === "h2" || level === "h3"
        ? element(level, context.tags[level], MARKDOWN_LOOK[level], inner, context, flush)
        : inner;
    }
    case "list":
      return list(node, context, flush, inItem);
    case "blockquote":
      // Kept by no use case, so always unwrapped to the blocks inside it.
      return renderBlocks(node.children, context, inItem);
    case "code":
      // `pre` and `code` are kept by no use case: the bare text is what is left.
      return text(node.value);
    case "html":
      // The app shows raw HTML as its own literal text rather than as markup.
      return text(node.value);
    case "thematicBreak":
    case "definition":
      return "";
    default:
      // Anything else — a GFM construct neither end enables — keeps its words.
      return textOf(node);
  }
}

/** The escaped text of any node, markup discarded. */
function textOf(node: Nodes): string {
  if ("children" in node) return node.children.map(textOf).join("");
  if ("value" in node) return text(node.value);
  return "";
}

/**
 * One element: painted with its look where the use case allows it, unwrapped to
 * its contents where it does not. `name` is the element the allow-list names;
 * `tag` is the one written, which differs for a heading under its outline.
 */
function element(
  name: string,
  tag: string,
  look: MarkdownLook,
  inner: string,
  context: Context,
  flush: boolean,
): string {
  return context.allowed.has(name)
    ? `<${tag} style="${blockStyle(look, flush ? 0 : (look.marginTop ?? 0))}">${inner}</${tag}>`
    : inner;
}

/**
 * A list, with the gap below each item but its last — the app's `space-y`,
 * which a mail writes on the items themselves.
 *
 * A *tight* list (no blank lines between items) renders each item's paragraph
 * as bare text, the way the app does; a loose one keeps the paragraphs, each
 * with its margin.
 *
 * `nested` is a list inside a list item, which takes the look's nested top
 * margin — the app paints the same value from the parent list's classes.
 */
function list(
  node: List,
  context: Context,
  flush: boolean,
  nested = false,
): string {
  const name = node.ordered === true ? "ol" : "ul";
  const look = MARKDOWN_LOOK[name];
  const loose = node.spread === true || node.children.some(itemIsLoose);
  const items = node.children
    .map((item, i) => {
      const last = i === node.children.length - 1;
      const inner = listItem(item, loose, context);
      return context.allowed.has("li")
        ? `<li style="margin:0 0 ${last ? 0 : look.itemGap}px;">${inner}</li>`
        : inner;
    })
    .join("\n");
  if (!context.allowed.has(name)) return items;
  const start =
    node.ordered === true && typeof node.start === "number" && node.start !== 1
      ? ` start="${node.start}"`
      : "";
  const top = flush ? 0 : nested ? look.nestedMarginTop : look.marginTop;
  return `<${name}${start} style="${blockStyle(look, top)}">${items}</${name}>`;
}

function itemIsLoose(item: ListItem): boolean {
  return typeof item.spread === "boolean" ? item.spread : item.children.length > 1;
}

function listItem(item: ListItem, loose: boolean, context: Context): string {
  return item.children
    .map((child) =>
      child.type === "paragraph" && !loose
        ? renderInline(child.children, context)
        : renderBlock(child, context, false, true),
    )
    .filter((block) => block !== "")
    .join("\n");
}

// ------------------------------------------------------------------- inline

function renderInline(nodes: PhrasingContent[], context: Context): string {
  return nodes.map((node) => renderPhrasing(node, context)).join("");
}

function renderPhrasing(node: PhrasingContent, context: Context): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
    case "html":
      return text(node.value);
    case "strong":
      return inline("strong", MARKDOWN_LOOK.strong, renderInline(node.children, context), context);
    case "emphasis":
      return context.allowed.has("em")
        ? `<em>${renderInline(node.children, context)}</em>`
        : renderInline(node.children, context);
    case "break":
      return context.allowed.has("br") ? "<br />" : "";
    case "link":
      return link(node.url, renderInline(node.children, context), context);
    case "linkReference": {
      const definition = context.definitions.get(node.identifier);
      const label = renderInline(node.children, context);
      return definition === undefined ? label : link(definition.url, label, context);
    }
    case "delete":
      return renderInline(node.children, context);
    case "image":
    case "imageReference":
    case "footnoteReference":
      return "";
  }
}

function inline(name: string, look: MarkdownLook, inner: string, context: Context): string {
  return context.allowed.has(name)
    ? `<${name} style="${css(textDeclarations(look))}">${inner}</${name}>`
    : inner;
}

/**
 * **A link the use case has no flag for, or whose href the URL transform
 * blanks, is its label.** The href goes through `react-markdown`'s `defaultUrlTransform`, the
 * function the app's renderer calls, so the two agree on which addresses
 * survive; an empty one is not inert (it resolves to the page it is on), so it
 * degrades to plain text in both. No `target`, whatever the address: a link
 * in a mail opens the browser anyway, so the app's new tab for another site's
 * address, and its marker saying so, have nothing to do here. The `rel`
 * withholds the referrer from every destination, as the app's does.
 *
 * **A link to one of our pages is written absolute and without a language**
 * (`mailOwnSiteHref`, on `NEXT_PUBLIC_SITE_URL`'s origin): a mail has no page
 * to resolve a relative address against, and a bare path lands the reader in
 * their own stored language, as every server-built link does. The app shows
 * the same link localised to the page it is on; both lead to the same page.
 */
function link(url: string, label: string, context: Context): string {
  if (!context.links) return label;
  const kept = defaultUrlTransform(url);
  if (kept === "") return label;
  const href = mailOwnSiteHref(kept);
  return `<a href="${escapeHtml(href)}" rel="noreferrer" style="${css(textDeclarations(MARKDOWN_LOOK.a))}">${label}</a>`;
}

/** A run of text as it reaches the mail: escaped, and safe from linkifiers. */
function text(value: string): string {
  return defuseAutolinks(escapeHtml(value));
}
