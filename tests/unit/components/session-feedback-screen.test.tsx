import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { SessionFeedbackScreen } from "@/components/voice/feedback/SessionFeedbackScreen";
import {
  SESSION_FEEDBACK_RATING_KEYS,
  type SessionFeedbackResult,
} from "@/components/voice/feedback/session-feedback-items";

/**
 * The screen collects answers and reports them once, and that is the whole of
 * its contract — no save, no route, no store. What is worth pinning is what a
 * child's session would otherwise lose silently:
 *
 * - **A tap charges the bar to that level**, filling every segment below it; a
 *   lower tap drains back to it, and a second tap on the level the fill already
 *   ends on empties the bar — the only route back to unanswered, and the one a
 *   child who tapped by accident needs. That second tap is the fragile one: an
 *   already-checked radio fires no change event, so a screen reading only
 *   `onChange` would swallow it silently.
 * - **The level's word is shown once**, on a line that exists before anything is
 *   chosen and empties with the bar: reserving it is what keeps an answer — or
 *   an un-answer — from moving the page under the next question.
 * - **Every statement is optional**, so Done with nothing chosen has to be a
 *   real answer (seven skips) rather than a blocked button or a dropped result.
 * - **Every statement is *reported***, answered or not — asserted on the
 *   captured argument with `toStrictEqual`, because `toHaveBeenCalledWith`
 *   counts a key holding `undefined` as absent and would pass an empty result.
 * - **Done stays down once pressed**, because the caller's next act is a
 *   full-page navigation and a button that re-enables in that gap fires twice.
 */

const ITEMS = [
  { key: "fun", label: "I had fun." },
  { key: "learned", label: "I learned something new." },
] as const;

type AskedKey = (typeof ITEMS)[number]["key"];

/** The five level words, as a reader meets them, in the order they charge. */
const WORDS = Object.values(SESSION_FEEDBACK_RATING_KEYS).map(
  (key) => messages.voice.feedback.scale[key],
);

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

/** One statement's charge bar, resolved through the sentence above it. */
function barFor(label: string): HTMLElement {
  const group = screen
    .getAllByRole("radiogroup")
    .find((candidate) => candidate.getAttribute("aria-labelledby") !== null &&
      document.getElementById(candidate.getAttribute("aria-labelledby")!)
        ?.textContent === label);
  if (group === undefined) throw new Error(`no charge bar for "${label}"`);
  return group;
}

/** One level's radio inside a bar, as the element that carries `checked`. */
function level(bar: HTMLElement, name: string): HTMLInputElement {
  const radio = within(bar).getByRole("radio", { name });
  if (!(radio instanceof HTMLInputElement)) {
    throw new Error(`"${name}" is not a native radio`);
  }
  return radio;
}

/** The line under a bar that holds the chosen level's word. */
function wordLine(label: string): HTMLElement {
  const line = barFor(label).nextElementSibling;
  if (!(line instanceof HTMLElement)) {
    throw new Error(`no word line under "${label}"`);
  }
  return line;
}

describe("the session feedback screen", () => {
  it("charges the bar to the level tapped and shows that level's word once", () => {
    renderScreen();
    const bar = barFor("I had fun.");

    fireEvent.click(level(bar, "Yes"));

    expect(level(bar, "Yes").checked).toBe(true);
    expect(wordLine("I had fun.").textContent).toBe("Yes");
    // Once, not five times: the words left the bar when it became a meter, so
    // every drawn segment is a block with nothing written on it.
    const segments = bar.querySelectorAll('[aria-hidden="true"]');
    expect(segments).toHaveLength(5);
    for (const segment of segments) expect(segment.textContent).toBe("");
  });

  it("drains back when a lower segment is tapped", () => {
    renderScreen();
    const bar = barFor("I had fun.");

    fireEvent.click(level(bar, "Yes"));
    fireEvent.click(level(bar, "Not really"));

    expect(level(bar, "Not really").checked).toBe(true);
    expect(level(bar, "Yes").checked).toBe(false);
    expect(wordLine("I had fun.").textContent).toBe("Not really");
  });

  it("empties the bar when the level it is charged to is tapped again", () => {
    renderScreen();
    const bar = barFor("I had fun.");

    fireEvent.click(level(bar, "Yes"));
    fireEvent.click(level(bar, "Yes"));

    for (const word of WORDS) expect(level(bar, word).checked).toBe(false);
    expect(wordLine("I had fun.").textContent).toBe("");
  });

  it("reports a statement emptied by a second tap as a skip", () => {
    const { onDone, results } = captureDone();
    renderScreen({ onDone });
    const bar = barFor("I had fun.");

    fireEvent.click(level(bar, "Yes"));
    fireEvent.click(level(bar, "Yes"));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(results[0]).toStrictEqual({
      answers: { fun: undefined, learned: undefined },
      note: "",
    });
  });

  it("reserves the word line before anything is chosen", () => {
    renderScreen();

    for (const item of ITEMS) {
      expect(wordLine(item.label).textContent).toBe("");
    }
  });

  it("gives each statement its own radio group, so the arrows stay inside one bar", () => {
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

    fireEvent.click(level(barFor("I had fun."), "Definitely"));
    fireEvent.click(level(barFor("I learned something new."), "No"));

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "we built a castle" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(results[0]).toStrictEqual({
      answers: { fun: 5, learned: 1 },
      note: "we built a castle",
    });
  });

  it("offers the note field open and writable from the first paint", () => {
    renderScreen();

    const field = screen.getByRole("textbox");
    expect(field.getAttribute("placeholder")).toBe(
      "Anything else you want to tell us about today’s session?",
    );

    fireEvent.change(field, { target: { value: "hi" } });
    expect(screen.getByDisplayValue("hi")).toBe(field);
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
