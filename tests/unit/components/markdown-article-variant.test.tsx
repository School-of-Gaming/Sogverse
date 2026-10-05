import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { Markdown } from "@/components/ui/markdown";

/**
 * **The article variant is text only: the marketing subset.**
 *
 * A Library article's body carries headings, paragraphs, emphasis, lists and
 * links, and nothing else. The constructs long-form markdown invites beyond
 * that — a picture, a quotation, a table — are outside the subset, so they
 * unwrap to their words like any other stray, and a picture, having no words,
 * vanishes.
 */
function renderArticle(markdown: string) {
  // A link off the site carries a translated marker, so the render takes the catalog.
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Markdown variant="article">{markdown}</Markdown>
    </NextIntlClientProvider>,
  ).container;
}

describe("the article markdown variant", () => {
  it("renders headings one level down, links, emphasis and lists", () => {
    const container = renderArticle(
      "# Section\n\nRead **this** and [that](https://example.com).\n\n- one\n- two",
    );
    expect(container.querySelector("h2")?.textContent).toBe("Section");
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("this");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com",
    );
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("drops an image entirely", () => {
    const container = renderArticle('![A badge](/badge.jpg "A caption.")');
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("figure")).toBeNull();
  });

  it("unwraps a quotation to its words", () => {
    const container = renderArticle("> Someone else's words.");
    expect(container.querySelector("blockquote")).toBeNull();
    expect(container.textContent).toContain("Someone else's words.");
  });

  it("does not parse a table", () => {
    const container = renderArticle("| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(container.querySelector("table")).toBeNull();
  });
});
