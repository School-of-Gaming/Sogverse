import { describe, expect, it } from "vitest";
import { messageToPlainText } from "@/lib/i18n/plain-text";
import { FAQ_ANSWER_TAGS } from "@/components/ui/faq-answer";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import { loadMessages } from "@/i18n/messages";

/**
 * The flattener behind both machine-readable views of an FAQ answer — the
 * `llms.txt` body and the `FAQPage` structured data.
 *
 * What it has to get right is small and entirely about what a *reader* sees:
 * no markup, no unfilled placeholder, and no two paragraphs run together into
 * one word.
 */
describe("messageToPlainText", () => {
  it("keeps a tag's inner text and drops the tag", () => {
    expect(messageToPlainText("<p>Clubs, camps and events.</p>")).toBe(
      "Clubs, camps and events.",
    );
  });

  it("separates adjacent blocks rather than running them together", () => {
    // The failure this pins reads "…calls them.Sogverse is…" — one word made
    // of two sentences, in every answer with more than one paragraph.
    expect(messageToPlainText("<p>One.</p><p>Two.</p>")).toBe("One. Two.");
  });

  it("flattens a list to its items", () => {
    expect(
      messageToPlainText("<p>We hold:</p><list><item>A name.</item><item>An age.</item></list>"),
    ).toBe("We hold: A name. An age.");
  });

  it("substitutes the values the component passes", () => {
    expect(
      messageToPlainText("<p>Email {supportEmail}.</p>", {
        supportEmail: "help@sog.gg",
      }),
    ).toBe("Email help@sog.gg.");
  });

  it("leaves a placeholder it was given no value for as written", () => {
    // Visible, and therefore fixable. Throwing here would take a publicly
    // cached response and a page's structured data down with it.
    expect(messageToPlainText("<p>Ask {somebody}.</p>")).toBe("Ask {somebody}.");
  });

  it("collapses the whitespace a flattened message leaves behind", () => {
    expect(messageToPlainText("  <p>One.</p>\n  <p>Two.</p>  ")).toBe("One. Two.");
  });

  it("leaves every real FAQ answer free of markup and placeholders, in every locale", async () => {
    // The catalog is the real input, so it is the real test: a tag added to
    // the answer vocabulary, or a new `{value}` a component supplies, shows up
    // here rather than in a crawler's copy of the page. All five locales,
    // because the `FAQPage` block renders on every language's About page —
    // only `llms.txt` is English-only.
    for (const locale of SUPPORTED_LOCALES) {
      const messages = await loadMessages(locale);

      for (const item of Object.values(messages.about.faq.items)) {
        const text = messageToPlainText(item.answer, { supportEmail: "help@sog.gg" });

        for (const tag of Object.keys(FAQ_ANSWER_TAGS)) {
          expect(text, locale).not.toContain(`<${tag}>`);
          expect(text, locale).not.toContain(`</${tag}>`);
        }
        expect(text, locale).not.toMatch(/\{\w+\}/);
        expect(text.length, locale).toBeGreaterThan(0);
      }
    }
  });
});
