import { describe, it, expect } from "vitest";
import { mailWeight, renderMarkdownForEmail } from "@/lib/email-templates/markdown";
import {
  MARKDOWN_CONTAINER,
  MARKDOWN_LOOK,
  type MarkdownLook,
} from "@/lib/authored-markdown";

/**
 * The mail's half of the one markdown style. What it keeps and drops per
 * variant, and its links, are held against the app's own render in
 * `tests/unit/components/markdown-one-style.test.tsx`; this file holds the
 * inline styles to the shared definition, and the mail-only duties (escaping,
 * defusing, list structure) to their contract.
 */

/** Every opening tag in the fragment, with its style attribute. */
function tags(html: string) {
  return [...html.matchAll(/<([a-z][a-z0-9]*)([^>]*)>/g)].map((m) => ({
    tag: m[1],
    style: /style="([^"]*)"/.exec(m[2])?.[1] ?? null,
  }));
}

function firstStyle(html: string, tag: string): string {
  const found = tags(html).find((t) => t.tag === tag);
  if (found?.style == null) throw new Error(`no styled <${tag}> in ${html}`);
  return found.style;
}

/** An inline style read back as values in the shared definition's own terms. */
function readStyle(style: string) {
  const declarations = new Map(
    style
      .split(";")
      .filter((d) => d.trim() !== "")
      .map((d) => {
        const at = d.indexOf(":");
        return [d.slice(0, at).trim(), d.slice(at + 1).trim()] as const;
      }),
  );
  const out: Record<string, string | number | boolean> = {};
  for (const [property, value] of declarations) {
    switch (property) {
      case "margin": {
        const [top, right = top, bottom = top, left = right] = value
          .split(/\s+/)
          .map((part) => parseFloat(part));
        out.marginTop = top;
        out.marginRight = right;
        out.marginBottom = bottom;
        out.marginLeft = left;
        break;
      }
      case "padding":
        out.padding = parseFloat(value);
        break;
      case "font-size":
        out.fontSize = parseFloat(value);
        break;
      case "line-height":
        out.lineHeight = Number(value);
        break;
      case "font-weight":
        out.fontWeight = Number(value);
        break;
      case "color":
        out.color = value.toLowerCase();
        break;
      case "list-style-type":
        out.listStyle = value;
        break;
      case "text-decoration":
        out.underline = value === "underline";
        break;
      case "text-underline-offset":
        out.underlineOffset = parseFloat(value);
        break;
      default:
        throw new Error(`a declaration the definition does not state: ${property}`);
    }
  }
  return out;
}

/** What the definition says a look's text half is, in a mail. */
function textExpected(look: MarkdownLook) {
  const out: Record<string, string | number | boolean> = {};
  if (look.fontSize !== undefined) out.fontSize = look.fontSize;
  if (look.lineHeight !== undefined) out.lineHeight = look.lineHeight;
  if (look.fontWeight !== undefined) out.fontWeight = mailWeight(look.fontWeight);
  if (look.color !== undefined) out.color = look.color.toLowerCase();
  if (look.underline === true) out.underline = true;
  if (look.underlineOffset !== undefined) out.underlineOffset = look.underlineOffset;
  return out;
}

/** A block: the container's text values under the element's own, and its top margin alone. */
function blockExpected(look: MarkdownLook, { flush = false } = {}) {
  return {
    ...textExpected(MARKDOWN_CONTAINER),
    ...textExpected(look),
    marginTop: flush ? 0 : (look.marginTop ?? 0),
    marginRight: 0,
    marginBottom: 0,
    marginLeft: look.indent ?? 0,
    ...(look.indent === undefined ? {} : { padding: 0 }),
    ...(look.listStyle === undefined ? {} : { listStyle: look.listStyle }),
  };
}

describe("the mail's inline styles are the one markdown style", () => {
  /** Every styled element, preceded by a paragraph so none of them is the flush first block. */
  const html = renderMarkdownForEmail(
    [
      "Lead.",
      "",
      "# Title",
      "",
      "## Heading",
      "",
      "### Subheading",
      "",
      "A **bold** word and [a link](https://example.com).",
      "",
      "- one",
      "- two",
      "",
      "1. first",
      "2. second",
    ].join("\n"),
    "marketing",
  );

  it("sets the container's body size, leading and ink on the wrapper", () => {
    expect(tags(html)[0].tag).toBe("div");
    expect(readStyle(firstStyle(html, "div"))).toEqual(textExpected(MARKDOWN_CONTAINER));
  });

  it.each([
    ["h1", "h2"],
    ["h2", "h3"],
    ["h3", "h4"],
    ["ul", "ul"],
    ["ol", "ol"],
  ] as const)("paints %s (as <%s>) with the definition's values", (element, tag) => {
    expect(readStyle(firstStyle(html, tag))).toEqual(blockExpected(MARKDOWN_LOOK[element]));
  });

  it("paints a paragraph with the definition's values", () => {
    const [, second] = tags(html).filter((t) => t.tag === "p");
    expect(readStyle(second.style ?? "")).toEqual(blockExpected(MARKDOWN_LOOK.p));
  });

  it.each(["strong", "a"] as const)("paints %s with the definition's values", (element) => {
    expect(readStyle(firstStyle(html, element))).toEqual(textExpected(MARKDOWN_LOOK[element]));
  });

  it("gaps every list item but the last by the list's item gap", () => {
    const items = tags(renderMarkdownForEmail("- one\n- two\n- three", "feed")).filter(
      (t) => t.tag === "li",
    );
    expect(items.map((item) => readStyle(item.style ?? "").marginBottom)).toEqual([
      MARKDOWN_LOOK.ul.itemGap,
      MARKDOWN_LOOK.ul.itemGap,
      0,
    ]);
  });

  /**
   * A sub-list's top gap is the definition's nested value — the item gap —
   * where the list around it keeps the block margin, for either kind of list
   * in either kind, tight or loose.
   */
  it.each([
    ["ul", "ul", "- parent\n  - child\n- sibling"],
    ["ul", "ol", "- parent\n  1. child\n- sibling"],
    ["ol", "ul", "1. parent\n   - child\n2. sibling"],
    ["ul", "ul", "- parent\n\n  - child\n\n- sibling"],
  ] as const)("gaps a %s nested <%s> by the nested value", (outer, inner, source) => {
    const lists = tags(renderMarkdownForEmail(`Lead.\n\n${source}`, "feed")).filter(
      (t) => t.tag === "ul" || t.tag === "ol",
    );
    expect(lists.map((t) => t.tag)).toEqual([outer, inner]);
    expect(readStyle(lists[0].style ?? "")).toEqual(blockExpected(MARKDOWN_LOOK[outer]));
    expect(readStyle(lists[1].style ?? "")).toEqual({
      ...blockExpected(MARKDOWN_LOOK[inner]),
      marginTop: MARKDOWN_LOOK[inner].nestedMarginTop,
    });
    expect(MARKDOWN_LOOK[inner].nestedMarginTop).toBe(MARKDOWN_LOOK[inner].itemGap);
  });

  it("sets the outermost first element flush, and only that one", () => {
    const flushed = renderMarkdownForEmail("# Title\n\nBody", "feed");
    expect(readStyle(firstStyle(flushed, "h3"))).toEqual(
      blockExpected(MARKDOWN_LOOK.h1, { flush: true }),
    );
    expect(readStyle(firstStyle(flushed, "p"))).toEqual(blockExpected(MARKDOWN_LOOK.p));
    // A loose list item's paragraph keeps its margin, as the app's does.
    const loose = renderMarkdownForEmail("- one\n\n- two", "feed");
    expect(readStyle(firstStyle(loose, "p")).marginTop).toBe(MARKDOWN_LOOK.p.marginTop);
  });

  it("asks the mail face only for the two weights it draws, where font matching lands", () => {
    expect([400, 500, 600, 700].map(mailWeight)).toEqual([400, 400, 700, 700]);
  });
});

describe("renderMarkdownForEmail", () => {
  it("renders bold, italic and hard breaks", () => {
    const html = renderMarkdownForEmail("**bold** and *italic*  \nnext line", "feed");
    expect(html).toMatch(/<strong [^>]*>bold<\/strong>/);
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<br />");
  });

  it("nests a sub-list inside its item", () => {
    const html = renderMarkdownForEmail("- parent\n  - child\n- sibling", "feed");
    expect(html).toMatch(/<li [^>]*>parent\n<ul [^>]*><li [^>]*>child<\/li><\/ul><\/li>/);
    expect(html.match(/<ul /g)).toHaveLength(2);
  });

  it("wraps the items of a loose list in paragraphs, and not those of a tight one", () => {
    const loose = renderMarkdownForEmail("- one\n\n- two", "feed");
    expect(loose.match(/<li [^>]*><p /g)).toHaveLength(2);
    const tight = renderMarkdownForEmail("- one\n- two", "feed");
    expect(tight).not.toContain("<p ");
  });

  it("keeps a numbered list's starting number", () => {
    expect(renderMarkdownForEmail("3. three\n4. four", "feed")).toContain('<ol start="3"');
    expect(renderMarkdownForEmail("1. one\n2. two", "feed")).not.toContain("start=");
  });

  /**
   * The browser leaves a bare address as text; every mail client linkifies it.
   * A word joiner after each dot keeps the words and defeats the pattern, for
   * the autolink spelling and for an address simply typed into a sentence.
   */
  it("defuses address-shaped text so a mail client cannot linkify it", () => {
    const html = renderMarkdownForEmail(
      "Go to <https://evil.example/x>, or evil.example/y, or write to someone@example.com.",
      "feed",
    );
    for (const literal of ["evil.example", "example.com", "https://"]) {
      expect(html).not.toContain(literal);
    }
    expect(html).toContain("https:&#8288;//evil.&#8288;example/x");
    expect(html).toContain("someone@example.&#8288;com.</p>");
    expect(html).not.toContain("<a");
    // Ordinary prose is left alone.
    expect(renderMarkdownForEmail("We met at 16.30, e.g. on Thursday.", "feed")).not.toContain(
      "&#8288;",
    );
  });

  it("writes a kept link's address escaped, and its label defused", () => {
    const html = renderMarkdownForEmail('[the shop](https://sog.gg/a?b=1&c="2")', "marketing");
    expect(html).toContain('href="https://sog.gg/a?b=1&amp;c=&quot;2&quot;"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).not.toContain("target=");
  });

  it("escapes text, and shows raw HTML in the source as its own literal text", () => {
    expect(renderMarkdownForEmail("a < b & c > d", "feed")).toContain("a &lt; b &amp; c &gt; d");

    const block = renderMarkdownForEmail("<script>alert(1)</script>", "feed");
    expect(block).not.toContain("<script");
    expect(block).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");

    const inline = renderMarkdownForEmail('hello <b onclick="x()">there</b>', "feed");
    expect(inline).not.toContain("<b");
    expect(inline).toContain("&lt;b onclick=&quot;x()&quot;&gt;there&lt;/b&gt;");
  });
});
