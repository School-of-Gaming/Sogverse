import { describe, it, expect } from "vitest";
import {
  renderMarkdownForEmail,
  EMAIL_MARKDOWN_ELEMENTS,
} from "@/lib/email-templates/markdown";
import { FEED_ELEMENTS } from "@/components/ui/markdown";

/** Every tag name the fragment opens, deduplicated. */
function tagsIn(html: string): string[] {
  return Array.from(new Set(Array.from(html.matchAll(/<([a-z][a-z0-9]*)/g), (m) => m[1])));
}

describe("renderMarkdownForEmail", () => {
  it("renders paragraphs and the three heading levels at three sizes", () => {
    const html = renderMarkdownForEmail("# Title\n\n## Section\n\n### Sub\n\nBody copy.");
    expect(html).toMatch(/<h1 [^>]*font-size:18px[^>]*>Title<\/h1>/);
    expect(html).toMatch(/<h2 [^>]*font-size:16px[^>]*>Section<\/h2>/);
    expect(html).toMatch(/<h3 [^>]*font-size:14px[^>]*>Sub<\/h3>/);
    expect(html).toMatch(/<p [^>]*>Body copy\.<\/p>/);
  });

  it("renders bold, italic and hard breaks", () => {
    const html = renderMarkdownForEmail("**bold** and *italic*  \nnext line");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<br />");
  });

  it("renders bulleted and numbered lists", () => {
    const bullets = renderMarkdownForEmail("- one\n- two");
    expect(bullets).toMatch(/<ul [^>]*padding-left:20px/);
    expect(bullets.match(/<li /g)).toHaveLength(2);
    expect(bullets).not.toContain("<p ");

    const numbered = renderMarkdownForEmail("1. one\n2. two");
    expect(numbered).toMatch(/<ol [^>]*>/);
    expect(numbered.match(/<li /g)).toHaveLength(2);
  });

  /**
   * A report is staff-authored and family-read, so a link in one unwraps to its
   * label — in the app and, by this test, in the mail.
   */
  it("renders a link as its label with no anchor and no destination", () => {
    const html = renderMarkdownForEmail("See [the rules](https://evil.example/phish) today.");
    expect(html).toContain("See the rules today.");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("href");
    expect(html).not.toContain("evil.example");
  });

  it("escapes text and never emits raw HTML from the source", () => {
    expect(renderMarkdownForEmail("a < b & c > d")).toContain("a &lt; b &amp; c &gt; d");

    const block = renderMarkdownForEmail("<script>alert(1)</script>");
    expect(block).not.toContain("<script");
    expect(block).not.toContain("alert");

    const inline = renderMarkdownForEmail("hello <b onclick=\"x()\">there</b>");
    expect(inline).toContain("hello there");
    expect(inline).not.toContain("<b");
    expect(inline).not.toContain("onclick");
  });

  it("unwraps deeper headings, blockquotes and code to their text", () => {
    const html = renderMarkdownForEmail(
      "#### Deep\n\n> Quoted words\n\nUse `x<y` here.\n\n```\ncode block\n```",
    );
    expect(html).toMatch(/<p [^>]*>Deep<\/p>/);
    expect(html).toMatch(/<p [^>]*>Quoted words<\/p>/);
    expect(html).toContain("Use x&lt;y here.");
    expect(html).toMatch(/<p [^>]*>code block<\/p>/);
    for (const tag of ["h4", "blockquote", "code", "pre"]) {
      expect(html).not.toContain(`<${tag}`);
    }
  });

  it("drops images and horizontal rules, which have no text to keep", () => {
    const html = renderMarkdownForEmail("Before\n\n![alt text](https://x.example/a.png)\n\n---\n\nAfter");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<hr");
    expect(html).not.toContain("x.example");
    expect(html).toContain("Before");
    expect(html).toContain("After");
  });

  it("gives the first block no top margin and the last block no bottom margin", () => {
    const html = renderMarkdownForEmail("# Title\n\nMiddle\n\nLast");
    expect(html).toMatch(/<h1 style="margin:0px 0 8px;/);
    expect(html).toMatch(/<p style="margin:0px 0 16px;[^>]*>Middle<\/p>/);
    expect(html).toMatch(/<p style="margin:0px 0 0px;[^>]*>Last<\/p>/);
  });

  /**
   * The email emits exactly the app's feed subset. Both lists are pinned to
   * each other, and a kitchen-sink document is rendered to prove the renderer
   * cannot produce a tag outside them.
   */
  it("emits the same element set the app's feed variant allows", () => {
    expect([...EMAIL_MARKDOWN_ELEMENTS].sort()).toEqual([...FEED_ELEMENTS].sort());

    const everything = [
      "# H1", "## H2", "### H3", "#### H4", "##### H5",
      "Para with **bold**, *em*, `code`, [link](https://a.example), ![img](https://a.example/i.png)  ",
      "hard break",
      "- a", "- b", "", "1. x", "2. y", "", "> quote", "", "---", "", "```", "fenced", "```",
      "<div>raw</div>", "", "| a | b |", "|---|---|", "| 1 | 2 |",
    ].join("\n");
    const emitted = tagsIn(renderMarkdownForEmail(everything));
    for (const tag of emitted) {
      expect(EMAIL_MARKDOWN_ELEMENTS).toContain(tag);
    }
  });
});
