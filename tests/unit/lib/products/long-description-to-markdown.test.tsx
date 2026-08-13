import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Markdown } from "@/components/ui/markdown";
import {
  longDescriptionToMarkdown,
  type MarkdownHeadingLevel,
} from "@/lib/products/long-description-to-markdown";
import type { ProductLongDescription } from "@/types";

/**
 * The conversion that turns a product's block-based long description into the
 * markdown that replaces it.
 *
 * Two obligations, and the second is the one worth the file. It has to preserve
 * the copy's **structure** — block order, heading versus paragraph, the line
 * breaks a paragraph carries — and it has to preserve the copy's **words**,
 * which is harder than it sounds: the stored text was always plain, so every
 * character in it was chosen without a thought for markdown, and a `*` or a
 * leading `-` that meant nothing yesterday changes how the page renders today.
 * The escaping tests below are therefore paired with rendering tests: asserting
 * that the output *contains a backslash* proves nothing about what a reader
 * sees, so the adversarial cases are pushed through the real renderer and
 * checked against the original words.
 */

function heading(text: string): ProductLongDescription[number] {
  return { type: "heading", text };
}

function paragraph(text: string): ProductLongDescription[number] {
  return { type: "paragraph", text };
}

/** The rendered page for a converted block array, as a DOM node to query. */
function renderConverted(
  blocks: ProductLongDescription,
  level: MarkdownHeadingLevel = 2,
): HTMLElement {
  const { container } = render(
    <Markdown variant="marketing">
      {longDescriptionToMarkdown(blocks, level)}
    </Markdown>,
  );
  return container;
}

/**
 * The words a reader sees, with whitespace collapsed.
 *
 * Collapsed on purpose: *where* the renderer puts a newline around a `<br>` is
 * the library's business, and pinning it would make these tests fail on an
 * upgrade that changed nothing anybody can see. What they are about is the
 * words being the writer's words — the structural claims beside each one (no
 * `<em>`, no `<ul>`, no `<a>`) carry the "and nothing became formatting" half.
 */
function words(container: HTMLElement): string {
  return container.textContent.replace(/\s+/g, " ").trim();
}

describe("structure", () => {
  it("returns an empty string when there are no blocks", () => {
    expect(longDescriptionToMarkdown([], 2)).toBe("");
  });

  it("emits the heading level it was asked for", () => {
    const blocks = [heading("Sections")];
    expect(longDescriptionToMarkdown(blocks, 1)).toBe("# Sections");
    expect(longDescriptionToMarkdown(blocks, 2)).toBe("## Sections");
    expect(longDescriptionToMarkdown(blocks, 3)).toBe("### Sections");
  });

  it("keeps block order and separates every block with a blank line", () => {
    const markdown = longDescriptionToMarkdown(
      [heading("One"), paragraph("First."), heading("Two"), paragraph("Second.")],
      2,
    );
    expect(markdown).toBe("## One\n\nFirst.\n\n## Two\n\nSecond.");
  });

  it("drops a block whose text is blank rather than emitting an empty one", () => {
    // An empty heading renders as nothing but a margin today, and an empty ATX
    // heading is a construct with no business being in stored copy.
    const markdown = longDescriptionToMarkdown(
      [heading(""), paragraph("   "), heading("Real"), paragraph("Body.")],
      2,
    );
    expect(markdown).toBe("## Real\n\nBody.");
  });

  it("renders each heading at the level it was converted to", () => {
    // The page's own h1 is the product name, so the writer's top level opens at
    // h2 and the scale steps down from there.
    const blocks = [heading("Sections"), paragraph("Body.")];
    expect(renderConverted(blocks, 1).querySelector("h2")?.textContent).toBe(
      "Sections",
    );
    expect(renderConverted(blocks, 2).querySelector("h3")?.textContent).toBe(
      "Sections",
    );
    expect(renderConverted(blocks, 3).querySelector("h4")?.textContent).toBe(
      "Sections",
    );
  });
});

describe("line breaks inside a paragraph", () => {
  it("turns a single newline into a hard break, because the page shows one today", () => {
    const markdown = longDescriptionToMarkdown(
      [paragraph("Line one.\nLine two.")],
      2,
    );
    expect(markdown).toBe("Line one.\\\nLine two.");

    const container = renderConverted([paragraph("Line one.\nLine two.")]);
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.querySelectorAll("br")).toHaveLength(1);
    expect(words(container)).toBe("Line one. Line two.");
  });

  it("turns a blank line into a paragraph break", () => {
    const container = renderConverted([
      paragraph("First thought.\n\nSecond thought."),
    ]);
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container.querySelectorAll("br")).toHaveLength(0);
  });

  it("collapses a run of blank lines rather than emitting empty paragraphs", () => {
    expect(
      longDescriptionToMarkdown([paragraph("A.\n\n\n\nB.")], 2),
    ).toBe("A.\n\nB.");
  });

  it("strips leading indentation, which would otherwise open a code block", () => {
    // Lossy and deliberately so: four leading spaces render as a monospace box,
    // which is a much bigger change than losing the spaces.
    const container = renderConverted([paragraph("    Indented line.")]);
    expect(container.querySelector("code")).toBeNull();
    expect(container.querySelector("pre")).toBeNull();
    expect(words(container)).toBe("Indented line.");
  });

  it("flattens newlines inside a heading, which markdown cannot hold", () => {
    expect(
      longDescriptionToMarkdown([heading("Two\nlines")], 2),
    ).toBe("## Two lines");
  });
});

/**
 * **Which lines get a hard break and which get a paragraph of their own.**
 *
 * An escape that only holds at the start of a paragraph does not survive being
 * reached over a hard break — the editor this field is edited in re-derives its
 * markdown on every save and does not write those backslashes back — so a line
 * that depends on one opens a fresh paragraph instead. The cost is a visible
 * gap where there used to be a tight break, which is why the rule is keyed to
 * the escaping rather than applied to every line.
 *
 * The round trip itself is pinned in `long-description-editor-round-trip`;
 * these are the arithmetic, so a change to which lines split shows up as a
 * failure here rather than only as a rendered difference somewhere else.
 */
describe("a line whose escaping is load-bearing starts its own paragraph", () => {
  it("leaves a line that needs no escaping on a hard break", () => {
    expect(
      longDescriptionToMarkdown([paragraph("Line one.\nLine two.")], 2),
    ).toBe("Line one.\\\nLine two.");
  });

  it("splits every line-leading marker off into its own paragraph", () => {
    for (const [typed, expected] of [
      ["Ready:\n- a computer", "Ready:\n\n\\- a computer"],
      ["Ready:\n+ a mouse", "Ready:\n\n\\+ a mouse"],
      ["Ready:\n1. first", "Ready:\n\n1\\. first"],
      ["Ready:\n2) second", "Ready:\n\n2\\) second"],
      ["Ready:\n# a hash", "Ready:\n\n\\# a hash"],
      ["Ready:\n> a quote", "Ready:\n\n\\> a quote"],
      ["Ready:\n| a table row", "Ready:\n\n\\| a table row"],
      ["A line\n---", "A line\n\n\\---"],
      ["A line\n===", "A line\n\n\\==="],
    ]) {
      expect(longDescriptionToMarkdown([paragraph(typed)], 2), typed).toBe(
        expected,
      );
    }
  });

  it("splits a line carrying an escaped character reference", () => {
    // The one escape a paragraph start cannot rescue either — see the round-trip
    // suite — but the line is no less fragile, and the rule is read off the
    // escaper's passes rather than a hand-picked subset of them.
    expect(
      longDescriptionToMarkdown([paragraph("Ready:\nthe AT&amp;T of it")], 2),
    ).toBe("Ready:\n\nthe AT\\&amp;T of it");
    // A bare `&` is not escaped, so it is not fragile and keeps its break.
    expect(
      longDescriptionToMarkdown([paragraph("Ready:\na mouse & a headset")], 2),
    ).toBe("Ready:\\\na mouse & a headset");
  });

  it("keeps the safe lines around a split on their hard breaks", () => {
    // The rule fires per line, not per block: one dashed line does not cost the
    // whole paragraph its spacing.
    expect(
      longDescriptionToMarkdown(
        [paragraph("Kit list:\n- a computer\nanything recent is fine\nand a mouse")],
        2,
      ),
    ).toBe("Kit list:\n\n\\- a computer\\\nanything recent is fine\\\nand a mouse");
  });

  it("does not split the first line of a block, which is already at a start", () => {
    expect(longDescriptionToMarkdown([paragraph("- a computer")], 2)).toBe(
      "\\- a computer",
    );
    expect(
      longDescriptionToMarkdown([paragraph("Intro.\n\n- a computer")], 2),
    ).toBe("Intro.\n\n\\- a computer");
  });
});

describe("text that would read as markdown syntax stays plain text", () => {
  /**
   * Each case is a string an admin has plausibly typed into a field that was
   * always plain, paired with the words a reader must still see. The assertion
   * is on the rendered output rather than on the escaping, because a backslash
   * in the right place is not the goal — an unchanged sentence is.
   */
  const PLAIN_TEXT_CASES: { name: string; text: string }[] = [
    { name: "emphasis stars", text: "A hidden 3 * 3 piston door * built twice" },
    { name: "underscores", text: "the profile called latest_release _ again" },
    { name: "brackets", text: "See [the handbook] for the [full] list" },
    { name: "an image marker", text: "![not an image](nowhere)" },
    { name: "backticks", text: "type `help` to see the commands" },
    { name: "a backslash", text: "the path is C:\\Users\\minecraft" },
    { name: "an autolink bracket", text: "mail us at <help@sog.gg> any time" },
    { name: "tildes", text: "roughly ~~20 minutes~~ per build" },
    { name: "a character reference", text: "the AT&amp;T of redstone" },
    { name: "a bare ampersand", text: "bring a mouse & a headset" },
  ];

  for (const { name, text } of PLAIN_TEXT_CASES) {
    it(`renders ${name} as written`, () => {
      const container = renderConverted([paragraph(text)]);
      expect(words(container)).toBe(text);
      expect(container.querySelector("em")).toBeNull();
      expect(container.querySelector("strong")).toBeNull();
      expect(container.querySelector("code")).toBeNull();
      expect(container.querySelector("a")).toBeNull();
      expect(container.querySelector("img")).toBeNull();
    });
  }

  it("keeps a hand-typed dash list as literal lines, not a bulleted list", () => {
    // The closest the block format gets to a list, and the case most likely to
    // be silently "improved" by a conversion: it renders as four lines of text
    // today and has to render as four lines of text afterwards.
    const typed = [
      "What to have ready:",
      "- a computer",
      "- a headset",
      "- a quiet corner",
    ].join("\n");
    const container = renderConverted([paragraph(typed)]);
    expect(container.querySelector("ul")).toBeNull();
    expect(container.querySelector("li")).toBeNull();
    expect(words(container)).toBe(typed.replace(/\n/g, " "));
  });

  it("keeps a numbered line from becoming an ordered list", () => {
    const typed = "The server runs:\n1.21 and later, nothing older";
    const container = renderConverted([paragraph(typed)]);
    expect(container.querySelector("ol")).toBeNull();
    expect(words(container)).toBe(typed.replace(/\n/g, " "));
  });

  it("neutralises every other line-leading block marker", () => {
    for (const line of [
      "+ a plus",
      "> a quote",
      "| a table row",
      "# a hash",
      "3) a bracketed number",
    ]) {
      const typed = `Lead in:\n${line}`;
      const container = renderConverted([paragraph(typed)]);
      // Two paragraphs rather than one: a line whose escaping is what keeps it
      // literal has to begin its own — see the paragraph-start describe below.
      expect(container.querySelectorAll("p"), line).toHaveLength(2);
      expect(container.querySelector("ul"), line).toBeNull();
      expect(container.querySelector("ol"), line).toBeNull();
      expect(container.querySelector("blockquote"), line).toBeNull();
      expect(words(container), line).toBe(typed.replace("\n", " "));
    }
  });

  it("keeps a setext underline from re-titling the line above it", () => {
    // `Heading\n===` is a markdown h1 spelled without hashes — the one syntax
    // that changes a line the writer did not touch.
    for (const underline of ["===", "---"]) {
      const typed = `A line\n${underline}`;
      const container = renderConverted([paragraph(typed)]);
      expect(container.querySelector("h1"), underline).toBeNull();
      expect(container.querySelector("h2"), underline).toBeNull();
      expect(container.querySelector("hr"), underline).toBeNull();
      expect(words(container), underline).toBe(typed.replace("\n", " "));
    }
  });

  it("keeps a heading's trailing hashes, which markdown would eat", () => {
    const container = renderConverted([heading("Ready? #")]);
    expect(container.querySelector("h3")?.textContent).toBe("Ready? #");
  });

  it("keeps syntax inside a heading plain too", () => {
    const container = renderConverted([heading("The 3 * 3 [door]")]);
    expect(container.querySelector("h3")?.textContent).toBe("The 3 * 3 [door]");
    expect(container.querySelector("em")).toBeNull();
  });
});

describe("the marketing renderer's own subset", () => {
  it("renders a link, which is what the new format is for", () => {
    const { container } = render(
      <Markdown variant="marketing">
        {"Read the [privacy policy](/privacy) first."}
      </Markdown>,
    );
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/privacy");
    expect(link?.getAttribute("rel")).toBe("noreferrer");
    expect(link?.getAttribute("target")).toBeNull();
  });

  it("degrades a link the library refused to trust into its own label", () => {
    // react-markdown replaces a disallowed scheme with an empty href rather
    // than dropping the node, and an empty href navigates to the current page —
    // so the renderer has to take the anchor away rather than ship a dead one.
    const { container } = render(
      <Markdown variant="marketing">
        {"[click me](javascript:alert(1))"}
      </Markdown>,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("click me");
  });

  it("still unwraps a link to its label in the feed variant", () => {
    // The gedu policy is unchanged and travels with the field, not the reader:
    // this is the same markdown, rendered by the other variant.
    const { container } = render(
      <Markdown>{"Read the [privacy policy](/privacy) first."}</Markdown>,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("Read the privacy policy first.");
  });
});
