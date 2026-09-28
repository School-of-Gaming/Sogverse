import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ZoneColorPicker } from "@/components/voice/ZoneColorPicker";
import { VOICE_ZONE_COLOR_KEYS } from "@/lib/constants/voice-zones";

/**
 * The swatch grid has two modes. A voice zone always has a colour, so its grid
 * is a radio group whose chosen swatch stays chosen. A profile's colour is
 * optional, so its grid opts into `clearable`: choosing the chosen swatch again
 * clears it — which a radio cannot express, so there the swatches are toggle
 * buttons instead.
 */

const [FIRST, SECOND] = VOICE_ZONE_COLOR_KEYS;

function renderPicker(ui: React.ReactElement) {
  render(
    <>
      <span id="label">Colour</span>
      {ui}
    </>,
  );
}

describe("ZoneColorPicker — a required colour", () => {
  it("is a radio group, and choosing the chosen swatch keeps it", () => {
    const onChange = vi.fn();
    renderPicker(
      <ZoneColorPicker value={FIRST} onChange={onChange} labelledBy="label" />,
    );

    const group = screen.getByRole("radiogroup", { name: "Colour" });
    const radios = screen.getAllByRole("radio");
    expect(group).toBeTruthy();
    expect(radios).toHaveLength(VOICE_ZONE_COLOR_KEYS.length);
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    expect(radios[0].hasAttribute("aria-pressed")).toBe(false);

    fireEvent.click(radios[0]);
    expect(onChange).toHaveBeenLastCalledWith(FIRST);
  });
});

describe("ZoneColorPicker — a clearable colour", () => {
  it("is a group of toggle buttons, at most one pressed", () => {
    renderPicker(
      <ZoneColorPicker
        clearable
        value={SECOND}
        onChange={() => {}}
        labelledBy="label"
      />,
    );

    expect(screen.getByRole("group", { name: "Colour" })).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    const pressed = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
  });

  it("chooses an unchosen swatch, and clears the chosen one", () => {
    const onChange = vi.fn();
    renderPicker(
      <ZoneColorPicker
        clearable
        value={FIRST}
        onChange={onChange}
        labelledBy="label"
      />,
    );
    const [first, second] = screen.getAllByRole("button");

    fireEvent.click(second);
    expect(onChange).toHaveBeenLastCalledWith(SECOND);
    fireEvent.click(first);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("starts with nothing pressed when there is no colour", () => {
    renderPicker(
      <ZoneColorPicker
        clearable
        value={null}
        onChange={() => {}}
        labelledBy="label"
      />,
    );

    expect(
      screen
        .getAllByRole("button")
        .every((b) => b.getAttribute("aria-pressed") === "false"),
    ).toBe(true);
  });
});
