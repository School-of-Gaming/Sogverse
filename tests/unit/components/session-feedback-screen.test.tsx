import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { SessionFeedbackScreen } from "@/components/voice/feedback/SessionFeedbackScreen";
import type { SessionFeedbackResult } from "@/components/voice/feedback/session-feedback-items";

/**
 * The screen collects answers and reports them once, and that is the whole of
 * its contract — no save, no route, no store. What is worth pinning is what a
 * child's session would otherwise lose silently:
 *
 * - **Every statement is optional**, so Done with nothing chosen has to be a
 *   real answer (seven skips) rather than a blocked button or a dropped result.
 * - **Re-choosing replaces**, because a child who taps the wrong word has no
 *   other way back — there is no clear control and never will be.
 * - **The note is collapsed until asked for**, which is the whole reason the
 *   question fits a phone; a textarea standing open is the regression.
 * - **Done stays down once pressed**, because the caller's next act is a
 *   full-page navigation and a button that re-enables in that gap fires twice.
 */

const ITEMS = [
  { key: "fun", label: "I had fun." },
  { key: "learned", label: "I learned something new." },
] as const;

function renderScreen(
  overrides: {
    onDone?: (result: SessionFeedbackResult) => void;
    committing?: boolean;
  } = {},
) {
  const onDone = overrides.onDone ?? vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SessionFeedbackScreen
        items={ITEMS}
        onDone={onDone}
        committing={overrides.committing ?? false}
      />
    </NextIntlClientProvider>,
  );
  return { onDone };
}

/** The five words of one statement's row, resolved through its own group. */
function rowFor(label: string): HTMLElement {
  const group = screen
    .getAllByRole("radiogroup")
    .find((candidate) => candidate.getAttribute("aria-labelledby") !== null &&
      document.getElementById(candidate.getAttribute("aria-labelledby")!)
        ?.textContent === label);
  if (group === undefined) throw new Error(`no answer row for "${label}"`);
  return group;
}

describe("the session feedback screen", () => {
  it("marks the word a reader picks, and moves the mark when they pick another", () => {
    renderScreen();
    const row = rowFor("I had fun.");

    fireEvent.click(within(row).getByRole("radio", { name: "A bit" }));
    expect(
      within(row).getByRole("radio", { name: "A bit" }).getAttribute("aria-checked"),
    ).toBe("true");

    fireEvent.click(within(row).getByRole("radio", { name: "Definitely" }));
    expect(
      within(row).getByRole("radio", { name: "Definitely" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      within(row).getByRole("radio", { name: "A bit" }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("reports every statement as unanswered when Done is pressed with nothing picked", () => {
    const onDone = vi.fn();
    renderScreen({ onDone });

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith({
      answers: { fun: undefined, learned: undefined },
      note: "",
    });
  });

  it("reports the values picked and the note typed", () => {
    const onDone = vi.fn();
    renderScreen({ onDone });

    fireEvent.click(
      within(rowFor("I had fun.")).getByRole("radio", { name: "Definitely" }),
    );
    fireEvent.click(
      within(rowFor("I learned something new.")).getByRole("radio", { name: "No" }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Anything else you want to tell us about today’s session?",
      }),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "we built a castle" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onDone).toHaveBeenCalledWith({
      answers: { fun: 5, learned: 1 },
      note: "we built a castle",
    });
  });

  it("keeps the note field collapsed until the line is tapped", () => {
    renderScreen();

    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Anything else you want to tell us about today’s session?",
      }),
    );

    expect(screen.getByRole("textbox")).not.toBeNull();
  });

  it("holds Done disabled while the caller is acting on it", () => {
    renderScreen({ committing: true });

    expect(
      screen.getByRole("button", { name: "Done" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
