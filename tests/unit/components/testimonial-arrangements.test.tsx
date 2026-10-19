import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enHome from "@/../messages/en/home.json";
import enTestimonial from "@/../messages/en/testimonial.json";
import { ParentTestimonials } from "@/components/about/parent-testimonials";
import {
  FeatureTestimonial,
  TestimonialPair,
  TestimonialRow,
  type ShownTestimonial,
} from "@/components/home/testimonial-arrangements";

const messages = { home: enHome, testimonial: enTestimonial };

const testimonial = (key: string, quote: string): ShownTestimonial => ({
  key,
  quote,
  attribution: "Mum, Finland",
});

const ONE = testimonial("one", "The highlight of the week.");
const THREE = [
  testimonial("sigh", "A sigh of happiness."),
  testimonial("groups", "Large groups are hard."),
  testimonial("finnish", "Her Finnish improved."),
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
    const { container } = inEnglish(<ParentTestimonials id="parents" />);
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

  it("marks a quote with its language only when it is not the page's", () => {
    const { container } = inEnglish(
      <TestimonialRow testimonials={[{ ...ONE, lang: "fi" }, testimonial("two", "Fun and supervised.")]} />,
    );
    const [marked, plain] = container.querySelectorAll("figure");
    expect(marked.getAttribute("lang")).toBe("fi");
    expect(plain.hasAttribute("lang")).toBe(false);
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
