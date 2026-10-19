import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/../messages/en/testimonial.json";
import fi from "@/../messages/fi/testimonial.json";
import fr from "@/../messages/fr/testimonial.json";
import sv from "@/../messages/sv/testimonial.json";
import tlh from "@/../messages/tlh/testimonial.json";
import { Testimonial } from "@/components/home/testimonial";

function renderIn(locale: string, messages: { quoted: string }) {
  return render(
    <NextIntlClientProvider locale={locale} messages={{ testimonial: messages }}>
      <Testimonial quote="Gaming is fun and supervised." attribution="Mum, Finland" />
    </NextIntlClientProvider>,
  );
}

/**
 * **The quotation marks are the component's, in the reader's locale's
 * style.** A quote is passed without them; the component wraps it in the page
 * locale's marks and shows whom it is from beneath.
 */
describe("Testimonial", () => {
  it("wraps the quote in each locale's own marks", () => {
    const cases = [
      ["en", en, "“Gaming is fun and supervised.”"],
      ["fi", fi, "”Gaming is fun and supervised.”"],
      ["sv", sv, "”Gaming is fun and supervised.”"],
      ["fr", fr, "« Gaming is fun and supervised. »"],
      ["tlh", tlh, "”Gaming is fun and supervised.”"],
    ] as const;
    for (const [locale, messages, shown] of cases) {
      const { container, unmount } = renderIn(locale, messages);
      expect(container.querySelector("blockquote")?.textContent).toBe(shown);
      unmount();
    }
  });

  it("shows whom the quote is from", () => {
    renderIn("en", en);
    expect(screen.getByText("Mum, Finland")).toBeTruthy();
  });
});
