import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Definition, Link, LinkReference, Nodes } from "mdast";
import { resolveCanonicalHref, type ResolvedHref, type SlugResolver } from "./own-site";

/**
 * **Every link in a markdown source, stored canonical**: each own-site href
 * rewritten to its internal route path (a slug address to its id address),
 * and each own-site href that leads nowhere reported for the writer to refuse.
 *
 * **What counts as a link is the renderer's answer.** The source is parsed by
 * `remark-parse` without extensions — the parser inside `react-markdown` — so
 * an inline link, an autolink (`<https://…>`) and a reference link resolved
 * through its definition are links here exactly when they are links on the
 * page. A GFM bare address is not: the renderer shows it as text.
 *
 * **Only the destinations change.** Every other byte of the source is left as
 * written: an edit replaces just the destination of an inline link or a
 * definition. An autolink is the one exception — its label *is* its address,
 * so it becomes an inline link labelled with the address it was written as.
 * A final re-parse checks the rewrite produced exactly the links intended.
 */

export interface DeadLink {
  /** The link's words, as the reader sees them. */
  text: string;
  /** The address as written. */
  href: string;
}

export interface CanonicalMarkdown {
  markdown: string;
  /** Every own-site link leading nowhere, in source order; empty when there is none. */
  deadLinks: DeadLink[];
}

const parser = unified().use(remarkParse);

export async function canonicalizeMarkdownLinks(
  markdown: string,
  resolver: SlugResolver,
  siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL,
): Promise<CanonicalMarkdown> {
  const tree = parser.parse(markdown);
  const { links, references, definitions } = collect(tree);

  const resolve = (href: string): Promise<ResolvedHref> =>
    resolveCanonicalHref(href, resolver, siteUrl);
  const linkResults = await Promise.all(links.map((link) => resolve(link.url)));
  const usedDefinitions = [...definitions.values()].filter((definition) =>
    references.some((reference) => reference.identifier === definition.identifier),
  );
  const definitionResults = new Map(
    await Promise.all(
      usedDefinitions.map(
        async (definition) => [definition.identifier, await resolve(definition.url)] as const,
      ),
    ),
  );

  const edits: Edit[] = [];
  const deadLinks: { offset: number; link: DeadLink }[] = [];

  links.forEach((link, i) => {
    const result = linkResults[i];
    if (result.kind === "dead") {
      deadLinks.push({ offset: offsetOf(link), link: { text: textOf(link), href: link.url } });
    } else if (result.kind === "internal" && result.path !== link.url) {
      edits.push(linkEdit(markdown, link, result.path));
    }
  });
  for (const definition of usedDefinitions) {
    const result = definitionResults.get(definition.identifier);
    if (result?.kind === "internal" && result.path !== definition.url) {
      edits.push(definitionEdit(markdown, definition, result.path));
    }
  }
  for (const reference of references) {
    const definition = definitions.get(reference.identifier);
    if (definition === undefined) continue;
    if (definitionResults.get(reference.identifier)?.kind === "dead") {
      deadLinks.push({
        offset: offsetOf(reference),
        link: { text: textOf(reference), href: definition.url },
      });
    }
  }

  const rewritten = applyEdits(markdown, edits);
  verify(rewritten, expectedHrefs(tree, links, linkResults, definitionResults));
  return {
    markdown: rewritten,
    deadLinks: deadLinks.sort((a, b) => a.offset - b.offset).map(({ link }) => link),
  };
}

// ------------------------------------------------------------------- the tree

interface Collected {
  links: Link[];
  references: LinkReference[];
  /** By identifier; the first definition of one wins, as it does on the page. */
  definitions: Map<string, Definition>;
}

function collect(tree: Nodes): Collected {
  const found: Collected = { links: [], references: [], definitions: new Map() };
  const visit = (node: Nodes) => {
    if (node.type === "link" && node.url !== "") found.links.push(node);
    if (node.type === "linkReference") found.references.push(node);
    if (node.type === "definition" && !found.definitions.has(node.identifier)) {
      found.definitions.set(node.identifier, node);
    }
    if ("children" in node) for (const child of node.children) visit(child);
  };
  visit(tree);
  return found;
}

/** Every link's href in document order, as the page would see it. */
function hrefsOf(tree: Nodes): string[] {
  const { definitions } = collect(tree);
  const hrefs: string[] = [];
  const visit = (node: Nodes) => {
    if (node.type === "link" && node.url !== "") hrefs.push(node.url);
    if (node.type === "linkReference") {
      const definition = definitions.get(node.identifier);
      if (definition !== undefined) hrefs.push(definition.url);
    }
    if ("children" in node) for (const child of node.children) visit(child);
  };
  visit(tree);
  return hrefs;
}

function expectedHrefs(
  tree: Nodes,
  links: Link[],
  linkResults: ResolvedHref[],
  definitionResults: ReadonlyMap<string, ResolvedHref>,
): string[] {
  const { definitions } = collect(tree);
  const hrefs: string[] = [];
  const visit = (node: Nodes) => {
    if (node.type === "link" && node.url !== "") {
      const result = linkResults[links.indexOf(node)];
      hrefs.push(result.kind === "internal" ? result.path : node.url);
    }
    if (node.type === "linkReference") {
      const definition = definitions.get(node.identifier);
      if (definition !== undefined) {
        const result = definitionResults.get(node.identifier);
        hrefs.push(result?.kind === "internal" ? result.path : definition.url);
      }
    }
    if ("children" in node) for (const child of node.children) visit(child);
  };
  visit(tree);
  return hrefs;
}

/**
 * The rewrite is positional, so it is checked by meaning: the new source must
 * parse to exactly the links intended. A mismatch is a bug here, never the
 * writer's, and must not reach storage.
 */
function verify(rewritten: string, expected: string[]): void {
  const actual = hrefsOf(parser.parse(rewritten));
  if (actual.length !== expected.length || actual.some((href, i) => href !== expected[i])) {
    throw new Error(
      `Canonicalising markdown links changed more than their destinations: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

/** The words a reader sees for a node. */
function textOf(node: Nodes): string {
  if ("children" in node) return node.children.map(textOf).join("");
  if (node.type === "text" || node.type === "inlineCode") return node.value;
  return "";
}

function offsetOf(node: Nodes): number {
  return node.position?.start.offset ?? 0;
}

// ------------------------------------------------------------------- edits

interface Edit {
  start: number;
  end: number;
  text: string;
}

function applyEdits(source: string, edits: Edit[]): string {
  let out = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    out = `${out.slice(0, edit.start)}${edit.text}${out.slice(edit.end)}`;
  }
  return out;
}

function positionOf(node: Nodes): { start: number; end: number } {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) {
    throw new Error("A parsed markdown node has no source position");
  }
  return { start, end };
}

/**
 * A destination written so it parses back to exactly `href`: parentheses and
 * backslashes escaped (balance is not assumed), and an `&` escaped where it
 * would otherwise start a character reference. A canonical href carries no
 * whitespace or angle brackets — the URL serialiser percent-encodes them.
 */
function destination(href: string): string {
  return href
    .replace(/[()\\]/g, (c) => `\\${c}`)
    .replace(/&(?=#?[A-Za-z0-9]+;)/g, "\\&");
}

/** Markdown-significant punctuation in a label, escaped so it stays text. */
function label(text: string): string {
  return text.replace(/[\\[\]*_`<>&!]/g, (c) => `\\${c}`);
}

function linkEdit(source: string, link: Link, href: string): Edit {
  const { start, end } = positionOf(link);
  if (source[start] === "<") {
    // An autolink: its address is its label, so it becomes an inline link
    // that still reads as the address it was written as.
    return { start, end, text: `[${label(textOf(link))}](${destination(href)})` };
  }
  const lastChild = link.children.at(-1);
  const labelEnd = lastChild === undefined ? start + 1 : positionOf(lastChild).end;
  if (source[labelEnd] !== "]" || source[labelEnd + 1] !== "(") {
    throw new Error("Could not find an inline link's destination in its source");
  }
  return destinationEdit(source, labelEnd + 2, end, href);
}

/** `[label]:` at the start of a definition, with any indentation before it. */
const DEFINITION_LABEL = /^[ \t]*\[(?:\\[\s\S]|[^\\\]])*\]:/;

function definitionEdit(source: string, definition: Definition, href: string): Edit {
  const { start, end } = positionOf(definition);
  const match = DEFINITION_LABEL.exec(source.slice(start, end));
  if (match === null) {
    throw new Error("Could not find a link definition's destination in its source");
  }
  return destinationEdit(source, start + match[0].length, end, href);
}

/**
 * The edit replacing the destination that starts after optional whitespace
 * (with at most one line ending) at `from`: an `<…>` form up to its closing
 * bracket, or a bare run up to whitespace or an unbalanced `)`.
 */
function destinationEdit(source: string, from: number, limit: number, href: string): Edit {
  let i = from;
  while (i < limit && (source[i] === " " || source[i] === "\t")) i++;
  if (source[i] === "\r") i++;
  if (source[i] === "\n") i++;
  while (i < limit && (source[i] === " " || source[i] === "\t")) i++;
  const start = i;

  if (source[i] === "<") {
    i++;
    while (i < limit && source[i] !== ">") i += source[i] === "\\" ? 2 : 1;
    return { start, end: i + 1, text: destination(href) };
  }
  let depth = 0;
  while (i < limit) {
    const c = source[i];
    if (c === "\\" && i + 1 < limit) {
      i += 2;
      continue;
    }
    if (c.charCodeAt(0) <= 0x20) break;
    if (c === "(") depth++;
    if (c === ")") {
      if (depth === 0) break;
      depth--;
    }
    i++;
  }
  return { start, end: i, text: destination(href) };
}
