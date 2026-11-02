import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enSettings from "@/../messages/en/settings.json";
import {
  MarketingPreferencesFields,
  type SchoolOfGamingEmailState,
} from "@/components/settings/marketing-preferences-fields";

/**
 * **The School of Gaming box shows Klaviyo's answer or no answer, never a
 * guess.** It is read live from a third party, so until the answer lands the
 * box is a ghost of its own size, a failed read leaves it unclickable beside a
 * retry, and while the card saves it is disabled like every other field.
 *
 * The note and the failure line share one grid cell, the inactive one hidden
 * by `invisible` so it still holds its height — that class is what is asserted,
 * since jsdom computes no layout.
 */

const messages = { settings: enSettings };
const { schoolOfGaming: LABEL, schoolOfGamingNote: NOTE, schoolOfGamingLoadFailed: FAILED, retry: RETRY } =
  enSettings.marketing;

function renderFields(schoolOfGaming: SchoolOfGamingEmailState, { disabled = false } = {}) {
  const onSchoolOfGamingChange = vi.fn();
  const onSchoolOfGamingRetry = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MarketingPreferencesFields
        schoolOfGaming={schoolOfGaming}
        onSchoolOfGamingChange={onSchoolOfGamingChange}
        onSchoolOfGamingRetry={onSchoolOfGamingRetry}
        granted={() => false}
        onChange={vi.fn()}
        disabled={disabled}
      />
    </NextIntlClientProvider>,
  );
  return { onSchoolOfGamingChange, onSchoolOfGamingRetry };
}

/** Whether the line holding this text is the hidden half of its cell. */
function hidden(text: string): boolean {
  const line = screen.getByText(text).closest("p");
  if (!line) throw new Error(`no line holds "${text}"`);
  return line.classList.contains("invisible");
}

const box = () => screen.queryByRole<HTMLInputElement>("checkbox", { name: LABEL });

describe("MarketingPreferencesFields — School of Gaming email", () => {
  it("is a ghost with no checkbox while Klaviyo answers, its note already painted", () => {
    renderFields("loading");

    expect(box()).toBeNull();
    expect(screen.getByTestId("school-of-gaming-email-ghost").className).toContain("animate-pulse");
    expect(hidden(NOTE)).toBe(false);
    expect(hidden(FAILED)).toBe(true);
  });

  it("says a failed read failed and offers a retry, with nothing to tick", () => {
    const { onSchoolOfGamingRetry } = renderFields("failed");

    expect(box()).toBeNull();
    expect(screen.getByTestId("school-of-gaming-email-ghost").className).not.toContain(
      "animate-pulse",
    );
    expect(hidden(FAILED)).toBe(false);
    expect(hidden(NOTE)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: RETRY }));
    expect(onSchoolOfGamingRetry).toHaveBeenCalledTimes(1);
  });

  it("is ticked for a subscribed parent, and unticking reports it", () => {
    const { onSchoolOfGamingChange } = renderFields({ subscribed: true });

    expect(box()?.checked).toBe(true);
    expect(box()?.disabled).toBe(false);
    expect(hidden(FAILED)).toBe(true);
    fireEvent.click(box()!);
    expect(onSchoolOfGamingChange).toHaveBeenCalledWith(false);
  });

  it("is unticked for a parent who is not subscribed, and ticking reports it", () => {
    const { onSchoolOfGamingChange } = renderFields({ subscribed: false });

    expect(box()?.checked).toBe(false);
    fireEvent.click(box()!);
    expect(onSchoolOfGamingChange).toHaveBeenCalledWith(true);
  });

  it("is disabled while the card commits", () => {
    renderFields({ subscribed: true }, { disabled: true });

    expect(box()?.disabled).toBe(true);
  });
});
