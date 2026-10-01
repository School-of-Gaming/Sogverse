import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ParentTestimonials } from "@/components/about/parent-testimonials";

/**
 * **About carries every parent quote the home page shows.** A signed-in reader
 * never reaches the home page, so a quote that lived only there would be out of
 * their reach. Pinned here: the section is the anchor the section pill points
 * at, it carries the home page's heading, and every one of the home page's
 * quotes appears in it with its attribution.
 */
describe("ParentTestimonials", () => {
  it("renders every home page quote under the anchor the section pill targets", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ParentTestimonials id="parents" />
      </NextIntlClientProvider>,
    );

    const section = container.querySelector("section#parents");
    expect(section).not.toBeNull();

    expect(
      screen.getByRole("heading", { level: 2, name: messages.home.testimonials.heading }),
    ).toBeTruthy();

    const items = Object.values(messages.home.testimonials.items);
    expect(items).toHaveLength(6);
    for (const { quote } of items) {
      expect(screen.getByText(quote)).toBeTruthy();
    }
    expect(container.querySelectorAll("figure")).toHaveLength(items.length);
  });
});
