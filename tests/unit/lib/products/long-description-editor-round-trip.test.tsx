import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { Markdown } from "@/components/ui/markdown";
import {
  readMarkdown,
  richTextExtensions,
} from "@/components/ui/rich-text-editor";
import { longDescriptionToMarkdown } from "@/lib/products/long-description-to-markdown";
import { LONG_DESCRIPTION_BLOCKS } from "@/components/public/products/mock-long-description-fixtures";
import type { ProductLongDescription } from "@/types";

/**
 * **Converted copy has to survive being edited, not just being rendered.**
 *
 * The conversion's own suite proves that a block array becomes markdown a
 * reader sees unchanged. That is only half the obligation, because the column
 * the markdown lands in is edited: an admin opens the product, fixes a typo
 * three sections away, and saves — and the save does not write back what was
 * stored, it writes back what the editor re-derives from its own document. Any
 * escape the editor's serialiser declines to reproduce is gone at that point,
 * and gone for good: the conversion rewrites the column in place, so there is
 * no earlier copy to compare against.
 *
 * That failure is invisible to every test that stops at the renderer, and it is
 * the failure this file exists to pin. Each case goes converted markdown →
 * a real editor → the markdown a save would store → the real renderer, and
 * asserts the reader still sees the admin's words with no elements the admin
 * never typed. The second save is asserted too: a value that keeps drifting on
 * every save is a different, worse defect from one that lands somewhere wrong
 * and stays.
 *
 * The editor is built from the component's own exported extension list and read
 * with its own exported serialiser call, so this cannot pass against a
 * configuration the product does not use.
 */

function paragraph(text: string): ProductLongDescription[number] {
  return { type: "paragraph", text };
}

/** One save: markdown into a real editor, and back out the way the form reads it. */
function save(markdown: string): string {
  const editor = new Editor({
    extensions: richTextExtensions({ variant: "marketing" }),
    content: markdown,
  });
  try {
    return readMarkdown(editor);
  } finally {
    editor.destroy();
  }
}

/**
 * The words a reader sees, with whitespace collapsed — the same reading the
 * conversion's own suite takes, for the same reason: where the renderer puts a
 * newline around a `<br>` is the library's business, and the claim here is
 * about the words rather than the whitespace between them.
 */
function words(container: HTMLElement): string {
  return container.textContent.replace(/\s+/g, " ").trim();
}

/**
 * Everything that would mean the text acquired formatting nobody typed.
 *
 * `br` and `p` are absent from the list on purpose: a hard break and a
 * paragraph are how the conversion carries the newlines the admin *did* type,
 * so their presence is the feature rather than the regression.
 */
const ACQUIRED_ELEMENTS = [
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "a",
  "code",
  "pre",
  "blockquote",
  "em",
  "strong",
];

/** Render markdown and assert the reader sees exactly `expected`, unstyled. */
function expectPlainRender(
  markdown: string,
  expected: string,
  label: string,
): void {
  const { container } = render(
    <Markdown variant="marketing">{markdown}</Markdown>,
  );
  expect(words(container), `${label}: words`).toBe(expected);
  for (const element of ACQUIRED_ELEMENTS) {
    expect(container.querySelector(element), `${label}: <${element}>`).toBeNull();
  }
}

/**
 * Each case is text an admin has plausibly typed into a field that was always
 * plain, and every one of them is a line that means something in markdown. They
 * are the cases where the conversion's escaping is load-bearing, which makes
 * them exactly the cases a serialiser that drops escapes would corrupt.
 */
const ROUND_TRIP_CASES: { name: string; text: string }[] = [
  {
    name: "a hand-typed dash list",
    text: [
      "What to have ready:",
      "- a computer that can run Minecraft",
      "- a headset with a microphone",
      "- a quiet corner of the house",
    ].join("\n"),
  },
  {
    name: "a hand-typed plus list",
    text: ["Bring along:", "+ a mouse", "+ something to rest it on"].join("\n"),
  },
  {
    name: "a hand-typed numbered list",
    text: [
      "How an evening runs:",
      "1. show and tell",
      "2. one contraption, together",
      "3. a look at whatever broke",
    ].join("\n"),
  },
  {
    name: "a line opening with a hash",
    // The hash is followed by a space, which is what makes it a heading rather
    // than a channel name: `#redstone` is inert in markdown either way, and a
    // case that cannot break is not a case.
    text: [
      "The house rules, in the order we say them:",
      "# 1 nobody's build is stupid",
      "# 2 ask before you break something",
    ].join("\n"),
  },
  {
    name: "a dashed underline beneath a line",
    text: "Session one\n---\nLevers, torches and nothing else.",
  },
  {
    name: "an equals underline beneath a line",
    text: "Session one\n===\nLevers, torches and nothing else.",
  },
  {
    // The same two markers with nothing under them. A rule that closes a block
    // is the dangerous half: with a line after it the hard break's own trailing
    // backslash happens to keep it from being read as an underline, and a case
    // that only passes by that accident proves nothing.
    name: "a dashed rule closing a block",
    text: "Levers, torches and nothing else.\n---",
  },
  {
    name: "an equals rule closing a block",
    text: "Levers, torches and nothing else.\n===",
  },
  {
    name: "safe and risky lines alternating",
    text: [
      "The kit list, and why each of it matters:",
      "- a computer that can run Minecraft",
      "anything from the last five years is fine",
      "- a headset with a microphone",
      "a phone's earbuds do the job",
      "- a corner of the house where an hour of talking is fine",
    ].join("\n"),
  },
];

describe("converted copy survives a save through the real editor", () => {
  for (const { name, text } of ROUND_TRIP_CASES) {
    it(`keeps ${name} as plain lines across two saves`, () => {
      const expected = text.replace(/\n/g, " ");
      const converted = longDescriptionToMarkdown([paragraph(text)], 2);

      // The page today: the conversion's own claim, restated here so a failure
      // below is unambiguous about which end broke.
      expectPlainRender(converted, expected, `${name}, converted`);

      // One save, on a product an admin opened to change something else.
      const saved = save(converted);
      expectPlainRender(saved, expected, `${name}, after one save`);

      // And the value has stopped moving. A round trip that drifts a little
      // every time is what turns one bad save into unreadable copy.
      expect(save(saved), `${name}, second save`).toBe(saved);
    });
  }

  /**
   * **The one case the paragraph split cannot rescue, recorded rather than
   * quietly asserted away.**
   *
   * A backslash before entity-shaped text is the only escape the conversion
   * makes that the editor's serialiser will not reproduce *anywhere* — a bare
   * `&` is not among the characters it escapes, so position makes no difference
   * and the first save decodes the entity. The words change; no formatting is
   * acquired, and the value settles after the second save rather than drifting
   * on. No product's copy currently contains one, and the fix would have to be
   * at the editing end, so this pins the damage instead of claiming there is
   * none.
   */
  it("loses an entity-shaped ampersand on the first save, and only that", () => {
    const text = "the AT&amp;T of redstone";
    const converted = longDescriptionToMarkdown([paragraph(text)], 2);
    expectPlainRender(converted, text, "entity, converted");

    const saved = save(converted);
    expectPlainRender(saved, "the AT&T of redstone", "entity, after one save");
    // Settled: the second save decodes nothing further, and the third is a
    // no-op.
    const resaved = save(saved);
    expectPlainRender(resaved, "the AT&T of redstone", "entity, after two");
    expect(save(resaved)).toBe(resaved);
  });

  /**
   * A page's worth of real copy rather than a line of it. The cases above are
   * each one hazard in isolation; a product's long description is several of
   * them inside four sections of prose, and the interesting failures are the
   * ones that need a heading above and a paragraph below to show up.
   */
  it("keeps a whole product's converted copy word for word", () => {
    const converted = longDescriptionToMarkdown(LONG_DESCRIPTION_BLOCKS, 2);
    const saved = save(converted);

    const expected = words(
      render(<Markdown variant="marketing">{converted}</Markdown>).container,
    );
    const after = render(<Markdown variant="marketing">{saved}</Markdown>);
    expect(words(after.container)).toBe(expected);
    // Headings stay headings and nothing else became one, and the hand-typed
    // list is still not a list.
    expect(after.container.querySelectorAll("h3")).toHaveLength(
      LONG_DESCRIPTION_BLOCKS.filter((b) => b.type === "heading").length,
    );
    expect(after.container.querySelector("ul")).toBeNull();
    expect(after.container.querySelector("ol")).toBeNull();
    expect(save(saved)).toBe(saved);
  });
});
