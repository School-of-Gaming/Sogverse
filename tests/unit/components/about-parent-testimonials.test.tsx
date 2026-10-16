import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ParentTestimonials } from "@/components/about/parent-testimonials";
import type { HomeTestimonials, PublicTestimonial } from "@/services/testimonials";

const testimonial = (id: string, quote: string): PublicTestimonial => ({
  id,
  versions: [{ locale: "en", from: "Mum, Finland", quote }],
});

const HOME: HomeTestimonials = {
  feature: [testimonial("8a0f3c1e-5b7d-4e2a-9c61-3d4e5f6a7b80", "The highlight of the week.")],
  safety: [
    testimonial("1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9", "Fun and supervised."),
    testimonial("2c3d4e5f-6071-4829-93a4-b5c6d7e8f90a", "A positive experience."),
  ],
  row: [
    testimonial("3d4e5f60-7182-493a-a4b5-c6d7e8f90a1b", "A sigh of happiness."),
    testimonial("4e5f6071-8293-4a4b-b5c6-d7e8f90a1b2c", "Large groups are hard."),
    testimonial("5f607182-93a4-4b5c-86d7-e8f90a1b2c3d", "Her Finnish improved."),
  ],
};

/**
 * **About shows exactly the home spots' testimonials.** A signed-in reader
 * never reaches the home page, so a quote that lived only there would be out
 * of their reach. Pinned here: the section is the anchor the section pill
 * points at, it carries the home page's heading, every placed testimonial
 * appears in it with whom it is from, and an empty group draws nothing.
 */
describe("ParentTestimonials", () => {
  it("renders every home spot's testimonial under the anchor the section pill targets", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ParentTestimonials id="parents" testimonials={HOME} />
      </NextIntlClientProvider>,
    );

    expect(container.querySelector("section#parents")).not.toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: messages.home.testimonials.heading }),
    ).toBeTruthy();

    const all = [...HOME.feature, ...HOME.safety, ...HOME.row];
    for (const { versions } of all) {
      expect(screen.getByText(`“${versions[0].quote}”`)).toBeTruthy();
    }
    expect(screen.getAllByText("Mum, Finland")).toHaveLength(all.length);
    expect(container.querySelectorAll("figure")).toHaveLength(all.length);
  });

  it("draws nothing for an empty group and keeps the others", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ParentTestimonials
          id="parents"
          testimonials={{ feature: [], safety: HOME.safety.slice(0, 1), row: [] }}
        />
      </NextIntlClientProvider>,
    );

    expect(container.querySelectorAll("figure")).toHaveLength(1);
    expect(container.querySelectorAll(".grid")).toHaveLength(1);
  });
});
