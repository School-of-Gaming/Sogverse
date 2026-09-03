import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/../messages/en.json";
import { GamerHelpFaq } from "@/components/help/help-faq";
import { AboutFaq } from "@/components/about/about-faq";

/**
 * The other half of the block-structure guarantee: that a tagged answer reaches
 * the page as real list and paragraph markup.
 *
 * The catalog test next door proves the messages are well-formed blocks, and
 * proves nothing about whether anything renders them — a tag dropped from the
 * shared vocabulary would leave `t.rich` emitting the chunks bare, which is a
 * numbered list silently becoming a run-on line. So these three read the DOM
 * for the constructs the copy actually uses, one per tag pair.
 */
describe("FAQ answer blocks render", () => {
  it("gamer steps become a real ordered list", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <GamerHelpFaq />
      </NextIntlClientProvider>,
    );
    const heading = screen.getByText("How do I join my session when it starts?");
    const details = heading.closest("details");
    const ol = details?.querySelector("ol");
    expect(ol, "ordered list present").not.toBeNull();
    expect(ol?.querySelectorAll("li").length).toBe(4);
    expect(details?.querySelectorAll("p").length).toBeGreaterThanOrEqual(3);
  });

  it("childData becomes a real bulleted list", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <AboutFaq />
      </NextIntlClientProvider>,
    );
    const heading = screen.getByText("What do you store about my child?");
    const details = heading.closest("details");
    const ul = details?.querySelector("ul");
    expect(ul, "bulleted list present").not.toBeNull();
    expect(ul?.querySelectorAll("li").length).toBe(5);
  });

  it("a multi-paragraph parent answer renders separate paragraphs", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <AboutFaq />
      </NextIntlClientProvider>,
    );
    const heading = screen.getByText("Can strangers talk to my child, and is anything recorded?");
    expect(heading.closest("details")?.querySelectorAll("p").length).toBe(4);
  });
});
