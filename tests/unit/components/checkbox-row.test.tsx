import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CheckboxRow } from "@/components/ui/checkbox-row";

/**
 * The row's whole reason to exist is the wiring a hand-rolled composition keeps
 * getting wrong: the label has to toggle the box, the hint has to be announced,
 * and the accessible name has to be the sentence rather than the sentence plus
 * everything else that happens to live inside the `<label>`.
 *
 * The ids are generated per row, so the assertions resolve them off the DOM
 * rather than matching a literal — which is also what proves two rows on one
 * surface cannot collide.
 */
function textOfReferenced(element: Element, attribute: string): string | null {
  const id = element.getAttribute(attribute);
  if (id === null) return null;
  const target = document.getElementById(id);
  if (target === null) throw new Error(`${attribute} points at no element`);
  return target.textContent;
}

describe("CheckboxRow", () => {
  it("toggles when the row — not just the box — is clicked", () => {
    const onCheckedChange = vi.fn();
    const { container } = render(
      <CheckboxRow
        checked={false}
        onCheckedChange={onCheckedChange}
        label="Send me news about clubs."
      />,
    );

    const row = container.querySelector("label");
    if (!row) throw new Error("the row rendered no <label>");
    fireEvent.click(row);

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("reports the current value back, so unticking sends false", () => {
    const onCheckedChange = vi.fn();
    render(
      <CheckboxRow
        checked
        onCheckedChange={onCheckedChange}
        label="I agree to the policy."
      />,
    );

    fireEvent.click(screen.getByRole("checkbox"));

    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it("names the box with the sentence alone and describes it with the hint", () => {
    render(
      <CheckboxRow
        checked={false}
        onCheckedChange={() => undefined}
        label="Send me news about clubs."
        hint="You can change this any time in your settings."
        tag="Optional"
        trailing={<span>Saved</span>}
      />,
    );

    const box = screen.getByRole("checkbox");

    // The chip, the hint and the trailing status all sit inside the same
    // <label>, so without the explicit labelledby the browser would fold every
    // one of them into the name.
    expect(textOfReferenced(box, "aria-labelledby")).toBe(
      "Send me news about clubs.",
    );
    expect(textOfReferenced(box, "aria-describedby")).toBe(
      "You can change this any time in your settings.",
    );
  });

  it("renders the tag's word, which is the only thing distinguishing a required row from an optional one", () => {
    // There is one visual shape, so a reader — and a screen reader walking the
    // row — has nothing but this word to go on. A regression that dropped it
    // would leave two identical rows saying nothing about which gates the CTA.
    render(
      <CheckboxRow
        checked={false}
        onCheckedChange={() => undefined}
        label="I agree to the policy."
        tag="Required"
      />,
    );

    expect(screen.getByText("Required")).not.toBeNull();
  });

  it("points at no description when there is no hint", () => {
    render(
      <CheckboxRow
        checked={false}
        onCheckedChange={() => undefined}
        label="Send me news about clubs."
      />,
    );

    expect(
      screen.getByRole("checkbox").getAttribute("aria-describedby"),
    ).toBeNull();
  });

  it("gives two rows on one surface their own hint ids", () => {
    render(
      <>
        <CheckboxRow
          checked={false}
          onCheckedChange={() => undefined}
          label="Our own mailing list."
          hint="First hint."
        />
        <CheckboxRow
          checked={false}
          onCheckedChange={() => undefined}
          label="A partner's mailing list."
          hint="Second hint."
        />
      </>,
    );

    const [first, second] = screen.getAllByRole("checkbox");
    expect(textOfReferenced(first, "aria-describedby")).toBe("First hint.");
    expect(textOfReferenced(second, "aria-describedby")).toBe("Second hint.");
  });
});
