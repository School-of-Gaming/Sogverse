import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ParentTestimonials } from "@/components/about/parent-testimonials";
import {
  FeatureTestimonial,
  TestimonialPair,
  TestimonialRow,
} from "@/components/home/testimonial-arrangements";
import type { PublicTestimonial } from "@/services/testimonials";

const testimonial = (id: string, quote: string): PublicTestimonial => ({
  id,
  versions: [{ locale: "en", from: "Mum, Finland", quote }],
});

const ONE = testimonial("8a0f3c1e-5b7d-4e2a-9c61-3d4e5f6a7b80", "The highlight of the week.");
const TWO = [
  testimonial("1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9", "Fun and supervised."),
  testimonial("2c3d4e5f-6071-4829-93a4-b5c6d7e8f90a", "A positive experience."),
];
const THREE = [
  testimonial("3d4e5f60-7182-493a-a4b5-c6d7e8f90a1b", "A sigh of happiness."),
  testimonial("4e5f6071-8293-4a4b-b5c6-d7e8f90a1b2c", "Large groups are hard."),
  testimonial("5f607182-93a4-4b5c-86d7-e8f90a1b2c3d", "Her Finnish improved."),
];

function inEnglish(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

const classes = (element: Element | null | undefined) =>
  new Set(element?.getAttribute("class")?.split(/\s+/).filter(Boolean) ?? []);

/**
 * **The arrangements the home page, About and a landing page's testimonials
 * section all render through**, held to the layout Home and About had before
 * they were shared: the classes each group paints with, as a set, so a change
 * to how a quote sits on either page is a change this test has to be told
 * about.
 */
describe("the shared testimonial arrangements", () => {
  it("lays About out exactly as before: the feature, the pair, the row", () => {
    const { container } = inEnglish(
      <ParentTestimonials id="parents" testimonials={{ feature: [ONE], safety: TWO, row: THREE }} />,
    );
    const section = container.querySelector("section#parents");
    const [feature] = section?.querySelectorAll(":scope > figure") ?? [];
    const [pair, row] = section?.querySelectorAll(":scope > .grid") ?? [];

    expect(classes(feature)).toEqual(
      new Set(["flex", "flex-col", "items-center", "gap-5", "text-center", "mx-auto", "mt-12", "max-w-3xl", "lg:mt-16"]),
    );
    expect(classes(pair)).toEqual(
      new Set(["mx-auto", "mt-16", "grid", "max-w-5xl", "gap-10", "md:grid-cols-2"]),
    );
    expect(classes(row)).toEqual(
      new Set(["mx-auto", "mt-10", "grid", "max-w-5xl", "gap-10", "md:grid-cols-3"]),
    );
    expect(pair.querySelectorAll("figure")).toHaveLength(2);
    expect(row.querySelectorAll("figure")).toHaveLength(3);
  });

  it("gives the home page its feature and row as before", () => {
    const feature = inEnglish(<FeatureTestimonial testimonial={ONE} />);
    expect(classes(feature.container.querySelector("figure"))).toEqual(
      new Set(["flex", "flex-col", "items-center", "gap-5", "text-center", "mx-auto", "max-w-3xl"]),
    );
    expect(classes(feature.container.querySelector("blockquote"))).toEqual(
      new Set(["font-serif", "italic", "text-foreground", "text-2xl", "leading-snug", "sm:text-3xl"]),
    );

    const row = inEnglish(<TestimonialRow testimonials={THREE} className="mt-12 lg:mt-16" />);
    expect(classes(row.container.querySelector(".grid"))).toEqual(
      new Set(["mx-auto", "mt-12", "grid", "max-w-5xl", "gap-10", "md:grid-cols-3", "lg:mt-16"]),
    );
  });

  it("draws nothing for a group with no testimonial", () => {
    const { container } = inEnglish(
      <>
        <TestimonialPair testimonials={[]} />
        <TestimonialRow testimonials={[]} />
      </>,
    );
    expect(container.innerHTML).toBe("");
  });
});
