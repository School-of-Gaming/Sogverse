import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { PinPad } from "@/components/pin/pin-pad";

/**
 * **The pad's keyboard listener is on `window`, so it hears every key on the
 * page — and it must decline the ones aimed at something else.**
 *
 * The pad has no text field of its own, which is why it listens globally: a
 * parent typing their PIN has nothing to focus first. But the same listener
 * on a page that also holds an input swallowed every digit and every Backspace
 * typed into that input, and called `preventDefault` on them, so the field
 * never saw the keystroke. Found on the style guide, where the switch-gate
 * demo sits beside the date picker's week box. The rule pinned here: a key
 * whose target is editable belongs to that target.
 */

function renderPad() {
  const onChange = vi.fn();
  const onComplete = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <div>
        <input aria-label="Elsewhere" defaultValue="" />
        <PinPad
          value=""
          onChange={onChange}
          onComplete={onComplete}
          ariaLabel="Enter your PIN"
        />
      </div>
    </NextIntlClientProvider>,
  );
  return { onChange, onComplete };
}

afterEach(cleanup);

describe("PinPad keyboard listener", () => {
  it("takes a digit typed with nothing editable focused", () => {
    const { onChange } = renderPad();
    fireEvent.keyDown(document.body, { key: "5" });
    expect(onChange).toHaveBeenCalledWith("5");
  });

  it("leaves a digit typed into another input to that input", () => {
    const { onChange } = renderPad();
    const elsewhere = document.querySelector("input");
    if (elsewhere === null) throw new Error("fixture input missing");
    const event = new KeyboardEvent("keydown", {
      key: "5",
      bubbles: true,
      cancelable: true,
    });
    elsewhere.dispatchEvent(event);
    expect(onChange).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves Backspace in another input alone too", () => {
    const { onChange } = renderPad();
    const elsewhere = document.querySelector("input");
    if (elsewhere === null) throw new Error("fixture input missing");
    const event = new KeyboardEvent("keydown", {
      key: "Backspace",
      bubbles: true,
      cancelable: true,
    });
    elsewhere.dispatchEvent(event);
    expect(onChange).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
