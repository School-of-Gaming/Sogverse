import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { HelpFeedbackCardView } from "@/components/help/help-feedback-card-view";
import { SUPPORT_EMAIL } from "@/lib/constants";

/**
 * **The support address is in the form's lead paragraph for an adult and
 * nowhere at all for a child, and that split is the whole of what varies
 * between the three Help & feedback sections.**
 *
 * It used to be a card of its own above the form, rendered on the parent and
 * gedu dashboards and withheld from the gamer's. Folding it into the copy kept
 * the difference and lost the second box — which is exactly why it is worth
 * pinning here rather than leaving to the message catalogue: a child has no
 * mailbox of their own, so an address handed to them is an answer they cannot
 * use, and the fix for a mistranslation that reintroduced one would not be
 * obvious from English.
 *
 * Rendered to static markup: nothing asserted here depends on an effect, and
 * the address has to be in the server's first HTML for a reader on a slow
 * connection to have it.
 */

function formHtml(audience: "adult" | "gamer"): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <HelpFeedbackCardView
        audience={audience}
        message=""
        onMessageChange={() => {}}
        submitting={false}
        succeeded={false}
        error={null}
        onSubmit={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

describe("the adult Help & feedback form", () => {
  const html = formHtml("adult");

  it("offers the support address as a live mailto", () => {
    expect(html).toContain(`href="mailto:${SUPPORT_EMAIL}"`);
    expect(html).toContain(SUPPORT_EMAIL);
  });

  it("takes the address from the constant, not from the catalogue", () => {
    // The one source of truth for the address is `SUPPORT_EMAIL`; a literal in
    // `messages/` is how the legal pages once carried three different addresses
    // across five languages, and English alone could not reveal it.
    expect(JSON.stringify(messages.helpSection.form)).not.toContain(
      SUPPORT_EMAIL,
    );
  });

  it("promises no reply — the thank-you thanks and stops there", () => {
    expect(messages.helpSection.form.adult.thankYou).not.toMatch(/reply/i);
  });
});

describe("the gamer Help form", () => {
  const html = formHtml("gamer");

  it("names no address at all: a gamer account has no mailbox of its own", () => {
    expect(html).not.toContain("mailto:");
    expect(html).not.toContain(SUPPORT_EMAIL);
  });

  it("says instead who will actually reach them", () => {
    expect(html).toContain(messages.helpSection.form.gamer.replyNote);
  });
});
