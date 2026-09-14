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
 * - **Every statement is *reported***, answered or not — asserted on the
 *   captured argument with `toStrictEqual`, because `toHaveBeenCalledWith`
 *   counts a key holding `undefined` as absent and would pass an empty result.
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

type AskedKey = (typeof ITEMS)[number]["key"];

function renderScreen(
  overrides: {
    onDone?: (result: SessionFeedbackResult<AskedKey>) => void;
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

/**
 * The last result a press of Done reported, captured rather than matched: the
 * assertions below have to see a key that is present and `undefined`, which is
 * exactly what an argument matcher cannot tell from a key that is missing.
 */
function captureDone() {
  const results: SessionFeedbackResult<AskedKey>[] = [];
  const onDone = (result: SessionFeedbackResult<AskedKey>) => {
    results.push(result);
  };
  return { onDone, results };
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

/** One word's radio inside a row, as the element that carries `checked`. */
function word(row: HTMLElement, name: string): HTMLInputElement {
  const radio = within(row).getByRole("radio", { name });
  if (!(radio instanceof HTMLInputElement)) {
    throw new Error(`"${name}" is not a native radio`);
  }
  return radio;
}

describe("the session feedback screen", () => {
  it("marks the word a reader picks, and moves the mark when they pick another", () => {
    renderScreen();
    const row = rowFor("I had fun.");

    fireEvent.click(word(row, "A bit"));
    expect(word(row, "A bit").checked).toBe(true);

    fireEvent.click(word(row, "Definitely"));
    expect(word(row, "Definitely").checked).toBe(true);
    expect(word(row, "A bit").checked).toBe(false);
  });

  it("gives each statement its own radio group, so the arrows stay inside one row", () => {
    renderScreen();

    const names = new Set(
      screen
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("name") ?? ""),
    );

    expect(names.size).toBe(ITEMS.length);
    expect(screen.getAllByRole("radio")).toHaveLength(ITEMS.length * 5);
  });

  it("reports every statement as unanswered when Done is pressed with nothing picked", () => {
    const { onDone, results } = captureDone();
    renderScreen({ onDone });

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(results).toHaveLength(1);
    // `toStrictEqual` is the point of the test: a result that dropped the
    // statements entirely would satisfy an argument matcher.
    expect(results[0]).toStrictEqual({
      answers: { fun: undefined, learned: undefined },
      note: "",
    });
    expect(Object.keys(results[0].answers)).toEqual(
      ITEMS.map((item) => item.key),
    );
  });

  it("reports the values picked and the note typed", () => {
    const { onDone, results } = captureDone();
    renderScreen({ onDone });

    fireEvent.click(word(rowFor("I had fun."), "Definitely"));
    fireEvent.click(word(rowFor("I learned something new."), "No"));

    fireEvent.click(
      screen.getByRole("button", {
        name: "Anything else you want to tell us about today’s session?",
      }),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "we built a castle" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(results[0]).toStrictEqual({
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
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.hasAttribute("disabled")).toBe(true);
    }
  });
});
