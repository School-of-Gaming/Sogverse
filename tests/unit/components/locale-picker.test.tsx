import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { LocalePicker } from "@/components/layout/locale-picker";
import { LocaleProvider } from "@/providers/locale-provider";
import {
  SUPPORTED_LOCALES,
  type DetectedLocale,
} from "@/lib/constants/locales";
import type { Profile } from "@/types";

/**
 * **`locale_picker_open` is a wire contract, and nothing else in the suite
 * spells it.** The event name and its two property keys are read by a Vercel
 * Analytics dashboard that this repo cannot type-check against: a typo in
 * `"locale_picker_open"`, or a rename of `current`, compiles, ships, and
 * surfaces months later as a chart that was always empty. So the strings are
 * written out here rather than imported from the component.
 *
 * The other half of what these tests pin is the *once*: this event is what
 * separates "never noticed the selector" from "noticed it and stayed" for a
 * visitor who never changes locale, so a second row per look would inflate
 * exactly the number it exists to produce.
 */

// The picker renders inside LocaleProvider, which reads useAuth(). Signed out
// is the shape these tests want — no profile locale to outrank the seed.
const mockAuth = vi.hoisted(() => ({
  profile: null as Profile | null,
  user: null as { id: string } | null,
  refreshProfile: vi.fn(),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockAuth,
}));

// Mock the wire call, not the `trackLocalePickerOpen` wrapper: the wrapper is
// where a rename would happen, so mocking it would hide the very thing under
// test. Same reasoning as tests/unit/providers/locale-provider.test.tsx.
const mockTrack = vi.hoisted(() => vi.fn());
vi.mock("@vercel/analytics", () => ({
  track: mockTrack,
}));

const TOGGLE_LABEL = messages.common.selectLanguage;
// Closed, the picker is its toggle alone; open, it is the toggle plus one row
// per locale. Counting buttons keeps "is the dropdown showing?" independent of
// how any single row is labelled — the flag components contribute their own
// titles to a row's accessible name, so matching on one language's name is a
// fight with the flag registry rather than a check on the dropdown.
const CLOSED_BUTTONS = 1;
const OPEN_BUTTONS = CLOSED_BUTTONS + SUPPORTED_LOCALES.length;

function renderPicker(detectedLocale: DetectedLocale) {
  return render(
    // The real next-intl provider, so useLocale() seeds the provider with "en"
    // and the picker's aria-label comes from the shipped messages.
    <NextIntlClientProvider locale="en" messages={messages}>
      <LocaleProvider detectedLocale={detectedLocale}>
        <LocalePicker />
      </LocaleProvider>
    </NextIntlClientProvider>,
  );
}

function toggle() {
  return screen.getByRole("button", { name: TOGGLE_LABEL });
}

describe("LocalePicker open event", () => {
  beforeEach(() => {
    mockTrack.mockClear();
  });

  it("reports what the browser guessed and what is on screen when the dropdown opens", () => {
    // Detected Finnish, showing English: the two properties carry different
    // values, so a swap of the keys cannot pass.
    renderPicker("fi");

    expect(mockTrack).not.toHaveBeenCalled();

    fireEvent.click(toggle());

    // The dropdown really opened — otherwise the assertion below would be
    // pinning an event fired by nothing the user can see.
    expect(screen.getAllByRole("button")).toHaveLength(OPEN_BUTTONS);
    expect(mockTrack).toHaveBeenCalledWith("locale_picker_open", {
      detected: "fi",
      current: "en",
    });
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it("does not fire a second time when the dropdown is closed again", () => {
    // Closing is not a second look. The toggle sits inside the ref that
    // useClickOutside watches, so the outside-click handler cannot close the
    // dropdown first and let this click re-open it — one look, one row.
    renderPicker("fi");

    fireEvent.click(toggle());
    fireEvent.click(toggle());

    expect(screen.getAllByRole("button")).toHaveLength(CLOSED_BUTTONS);
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it('reports detected as "none" when the browser asked for nothing we ship', () => {
    // A German-only browser is looking at English because English is the
    // fallback, not because English was detected. Reporting "en" here would
    // count this look as a happy one against a guess we never made.
    renderPicker("none");

    fireEvent.click(toggle());

    expect(mockTrack).toHaveBeenCalledWith("locale_picker_open", {
      detected: "none",
      current: "en",
    });
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });
});
