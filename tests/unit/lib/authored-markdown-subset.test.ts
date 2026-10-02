import { describe, expect, it } from "vitest";
import { MARKDOWN_USE_CASES, type MarkdownUseCase } from "@/lib/authored-markdown";
import {
  MARKDOWN_ELEMENT_NAMES,
  describeMarkdownSubset,
  markdownOutsideSubset,
} from "@/lib/authored-markdown-subset";

/**
 * **The check a write outside the editor is refused by.** It judges a source
 * against the renderer's own allow-list, so everything the renderer would
 * unwrap is named, and everything it keeps passes.
 */

const constructs = (markdown: string, useCase: MarkdownUseCase = "article") =>
  markdownOutsideSubset(markdown, useCase).map((found) => found.construct);

describe("markdownOutsideSubset", () => {
  it("passes everything an article keeps", () => {
    const markdown = [
      "# Top",
      "",
      "## Second",
      "",
      "### Third",
      "",
      "A paragraph with **bold**, *italic* and a [link](https://example.com).\\",
      "After a hard break, a [relative one](/library) and [mail](mailto:hi@sog.gg).",
      "",
      "- a bullet",
      "  1. a nested number",
      "",
      "1. a number",
    ].join("\n");

    expect(markdownOutsideSubset(markdown, "article")).toEqual([]);
  });

  it("names each construct the renderer would unwrap, with its lines", () => {
    const markdown = [
      "#### Too deep",
      "",
      "![a cover](https://example.com/a.png)",
      "",
      "```",
      "code",
      "```",
      "",
      "> quoted",
      "",
      "---",
      "",
      "Some `inline` code.",
    ].join("\n");

    expect(markdownOutsideSubset(markdown, "article")).toEqual([
      { construct: "a level-4 heading (####)", lines: [1] },
      { construct: "an image (![alt](url))", lines: [3] },
      { construct: "a code block", lines: [5] },
      { construct: "a block quote (> text)", lines: [9] },
      { construct: "a horizontal rule (---)", lines: [11] },
      { construct: "inline code (`code`)", lines: [13] },
    ]);
  });

  it("collects every line a construct appears on", () => {
    expect(
      markdownOutsideSubset("![a](x.png)\n\n![b](y.png)", "article"),
    ).toEqual([{ construct: "an image (![alt](url))", lines: [1, 3] }]);
  });

  it("names raw HTML, which readers would see as literal tags", () => {
    expect(constructs("Hello <b>there</b>")).toEqual([
      "raw HTML (readers would see the tags as text)",
    ]);
  });

  it("names a link whose address the renderer would blank", () => {
    expect(constructs("[click](javascript:alert(1))")).toEqual([
      'a link to "javascript:alert(1)", an address readers\' pages strip (use http, https, mailto or a relative address)',
    ]);
  });

  it("follows the use case: a link is outside a family feed's subset", () => {
    expect(constructs("[a link](https://example.com)", "feed")).toEqual([
      "a link ([label](url))",
    ]);
  });

  it("leaves GitHub extensions alone: they parse as text, which is what readers see", () => {
    expect(constructs("| a | b |\n|---|---|\n| 1 | 2 |\n\n~~struck~~")).toEqual([]);
  });
});

describe("describeMarkdownSubset", () => {
  it("names every element every use case keeps", () => {
    for (const { allowedElements } of Object.values(MARKDOWN_USE_CASES)) {
      for (const element of allowedElements) {
        expect(MARKDOWN_ELEMENT_NAMES[element], element).toBeDefined();
      }
    }
  });

  it("states an article's subset in words", () => {
    expect(describeMarkdownSubset("article")).toBe(
      "paragraphs, bold (**text**), italic (*text*), bulleted lists (- item), numbered lists (1. item), hard line breaks (a line ending in a backslash), level-1 headings (#), level-2 headings (##), level-3 headings (###) and links ([label](url))",
    );
  });
});
