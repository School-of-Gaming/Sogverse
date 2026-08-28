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
  const ids = element.getAttribute(attribute);
  if (ids === null) return null;
  return ids
    .split(" ")
    .filter(Boolean)
    .map((id) => {
      const target = document.getElementById(id);
      if (target === null) throw new Error(`${attribute} points at no element`);
      return target.textContent;
    })
    .join(" ");
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

    // The name is the sentence alone: the chip, the hint and the trailing
    // status all sit inside the same <label>, so without the explicit
    // labelledby the browser would fold every one of them into it.
    expect(textOfReferenced(box, "aria-labelledby")).toBe(
      "Send me news about clubs.",
    );
    // **Both the hint and the chip are handed back as the description**, and
    // the chip half is the load-bearing one: there is a single visual shape,
    // so "Optional" is the entire distinction between this row and a gate. A
    // chip that only rendered would leave a screen-reader user with no way to
    // tell which rows they may skip. Trailing status stays out — it is a
    // transient save state, not something that qualifies the question.
    expect(textOfReferenced(box, "aria-describedby")).toBe(
      "You can change this any time in your settings. Optional",
    );
  });

  it("announces the tag even on a row with no hint", () => {
    render(
      <CheckboxRow
        checked={false}
        onCheckedChange={() => undefined}
        label="Share my email with our partner."
        tag="Optional"
      />,
    );

    const box = screen.getByRole("checkbox");
    expect(screen.getByText("Optional")).not.toBeNull();
    expect(textOfReferenced(box, "aria-describedby")).toBe("Optional");
  });

  it("points at no description when there is neither hint nor tag", () => {
    // An empty `aria-describedby` is a dangling reference rather than an absent
    // one, so a row with nothing to describe must carry no attribute at all.
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
