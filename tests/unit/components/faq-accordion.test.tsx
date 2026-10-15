import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { FaqAccordion } from "@/components/ui/faq-accordion";

/**
 * **The shared FAQ list's one invisible contract: an empty list is absent.**
 *
 * Every FAQ surface on the site is seeded empty and grows one question at a
 * time, so the zero-item render is the state most of them are in at launch —
 * and it is the one state a style-guide demo cannot show, because there is
 * nothing on screen to look at. The rule it has to satisfy is that no space is
 * reserved for copy that does not exist yet: not an empty card, not a divider,
 * not a hole where the list would go.
 *
 * `container.innerHTML === ""` is the assertion that actually pins that. A
 * query for the rows would pass just as happily against an empty bordered card.
 */
describe("FaqAccordion", () => {
  afterEach(cleanup);

  it("renders nothing at all when given no items", () => {
    const { container } = render(<FaqAccordion items={[]} questionLevel={3} />);

    expect(container.innerHTML).toBe("");
  });

  it("renders one collapsed disclosure row per item, in the order given", () => {
    const { container } = render(
      <FaqAccordion
        questionLevel={3}
        items={[
          { key: "first", question: "First question", answer: <p>First answer</p> },
          { key: "second", question: "Second question", answer: <p>Second answer</p> },
        ]}
      />,
    );

    const rows = container.querySelectorAll("details");
    expect(rows).toHaveLength(2);
    expect([...rows].map((r) => r.querySelector("summary")?.textContent)).toEqual([
      "First question",
      "Second question",
    ]);
    // Collapsed on arrival: the reader chooses what to open, and an accordion
    // that opens itself pushes everything below it down on nobody's request.
    expect([...rows].every((r) => !r.open)).toBe(true);
  });

  it("draws each question as a heading of the caller's level inside its summary", () => {
    // The heading is what ties an answer to its question for a crawler or an
    // assistant reading the outline; it has to sit inside the summary so the
    // row stays the one native control that opens it.
    const { container } = render(
      <FaqAccordion
        questionLevel={4}
        items={[{ key: "only", question: "Only question", answer: <p>Only answer</p> }]}
      />,
    );

    const heading = container.querySelector("summary > h4");
    expect(heading?.textContent).toBe("Only question");
    expect(container.querySelectorAll("h1, h2, h3, h5, h6")).toHaveLength(0);
  });
});
