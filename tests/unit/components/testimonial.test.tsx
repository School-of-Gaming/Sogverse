import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/../messages/en.json";
import fi from "@/../messages/fi.json";
import fr from "@/../messages/fr.json";
import sv from "@/../messages/sv.json";
import tlh from "@/../messages/tlh.json";
import { Testimonial } from "@/components/home/testimonial";
import type { PublicTestimonial } from "@/services/testimonials";

const ID = "6a1b2c3d-4e5f-4607-8899-aabbccddeeff";

const TESTIMONIAL: PublicTestimonial = {
  id: ID,
  versions: [
    { locale: "en", from: "Mum, Finland", quote: "Gaming is fun and supervised." },
    { locale: "fi", from: "Äiti, Suomi", quote: "Pelaaminen on hauskaa ja valvottua." },
  ],
};

function renderIn(
  locale: string,
  messages: Record<string, unknown>,
  testimonial = TESTIMONIAL,
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Testimonial testimonial={testimonial} />
    </NextIntlClientProvider>,
  );
}

/**
 * **The quotation marks are the page's, in the reader's locale's style.** A
 * stored quote carries none; the component wraps the picked version in the
 * page locale's marks, and marks a version shown in another language with
 * `lang`.
 */
describe("Testimonial", () => {
  it("wraps the quote in each locale's own marks", () => {
    const cases = [
      ["en", en, "“Gaming is fun and supervised.”"],
      ["fi", fi, "”Pelaaminen on hauskaa ja valvottua.”"],
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

  it("shows the reader's version and whom it is from, with no lang mark", () => {
    const { container } = renderIn("fi", fi);
    expect(screen.getByText("Äiti, Suomi")).toBeTruthy();
    expect(container.querySelector("figure")?.getAttribute("lang")).toBeNull();
  });

  it("marks a fallback version with its own language", () => {
    const { container } = renderIn("fr", fr);
    expect(screen.getByText("Mum, Finland")).toBeTruthy();
    expect(container.querySelector("figure")?.getAttribute("lang")).toBe("en");
  });
});
