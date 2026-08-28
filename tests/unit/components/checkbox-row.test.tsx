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
        hint="Optional — you can change this anytime in your settings."
        trailing={<span>Saved</span>}
      />,
    );

    const box = screen.getByRole("checkbox");

    // The name is the sentence alone: the hint and the trailing status both sit
    // inside the same <label>, so without the explicit labelledby the browser
    // would fold them into it.
    expect(textOfReferenced(box, "aria-labelledby")).toBe(
      "Send me news about clubs.",
    );
    // **The hint is handed back as the description, and that is load-bearing.**
    // There is one visual shape for every consent row, so this sentence — which
    // opens on the word "Optional" — is the entire distinction between an ask
    // and a gate. It has to reach a focused control, or a screen-reader user
    // cannot tell which rows they may skip. It is also what made the retired
    // "Optional" chip safe to delete: the word was always in the sentence,
    // never in the styling. Trailing status stays out — a transient save state
    // does not qualify the question.
    expect(textOfReferenced(box, "aria-describedby")).toBe(
      "Optional — you can change this anytime in your settings.",
    );
  });

  it("tones the hint muted by default and info on request, without touching the size", () => {
    const optionality = "Optional — you can change this anytime in your settings.";
    const { rerender } = render(
      <CheckboxRow
        checked={false}
        onCheckedChange={() => undefined}
        label="Share my email with our partner."
        hint={optionality}
      />,
    );

    // Default: an aside, in the same muted grey every other sub-line uses.
    expect(screen.getByText(optionality).className).toContain(
      "text-muted-foreground",
    );

    rerender(
      <CheckboxRow
        checked={false}
        onCheckedChange={() => undefined}
        label="Share my email with our partner."
        hint={optionality}
        hintTone="info"
      />,
    );

    // Info: the quiet tier of the app's info family — coloured text, no fill
    // and no border, because the row already has an edge of its own. The size
    // does not move with the tone; a marker that changed scale would read as a
    // different kind of thing rather than the same note said in colour.
    const hint = screen.getByText(optionality);
    expect(hint.className).toContain("text-info");
    expect(hint.className).not.toContain("text-muted-foreground");
    expect(hint.className).toContain("text-xs");
  });

  it("points at no description when there is no hint", () => {
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
