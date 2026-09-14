import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { SessionFeedbackScreen } from "@/components/voice/feedback/SessionFeedbackScreen";
import type { SessionFeedbackInitialState } from "@/components/voice/feedback/SessionFeedbackScreen";
import {
  SESSION_FEEDBACK_NOTE_MAX_LENGTH,
  SESSION_FEEDBACK_RATING_KEYS,
  type SessionFeedbackResult,
} from "@/components/voice/feedback/session-feedback-items";

/**
 * The screen opens on a state it is handed, collects answers and reports them
 * once, and that is the whole of its contract — no save, no route, no store.
 * What is worth pinning is what a child's session would otherwise lose
 * silently:
 *
 * - **It opens charged to whatever it was handed**, and reports that back
 *   merged with whatever the reader then did to it — including a seeded answer
 *   taken back off the record by a second tap, which is the one path where a
 *   stored value has to *stop* being reported.
 * - **The initial state is read once.** A later one is a read landing behind
 *   the reader, so a rerender with a different one must change nothing —
 *   asserted through a rerender rather than a fresh mount, because a fresh
 *   mount cannot tell "read once" from "read every render".
 * - **The status line is there only when the caller hands one over**, above the
 *   button it is about, because a reader at the foot of the column cannot read
 *   a line at the top of it.
 * - **A tap charges the bar to that level**, filling every segment below it; a
 *   lower tap drains back to it, and a second tap on the level the fill already
 *   ends on empties the bar — the only route back to unanswered, and the one a
 *   child who tapped by accident needs. That second tap is the fragile one: an
 *   already-checked radio fires no change event, so a screen reading only
 *   `onChange` would swallow it silently.
 * - **Every tap here lands on the visible segment**, never on the sr-only radio
 *   inside it. The click/change split only works because a click on the label is
 *   forwarded to the control it labels, and firing straight at the input would
 *   skip exactly the half of the path a reader actually uses.
 * - **The level's word is shown once**, on a line that exists before anything is
 *   chosen and empties with the bar: reserving it is what keeps an answer — or
 *   an un-answer — from moving the page under the next question.
 * - **The word sits under the segment that was tapped** — the line is the bar's
 *   own five columns, and the column the word lands in is what makes the caption
 *   point at the choice rather than at the middle of the control. The column is
 *   asserted through the readout's `data-column`, which is the one part of that
 *   placement a test without layout can see.
 * - **Every statement is optional**, so Done with nothing chosen has to be a
 *   real answer (five skips) rather than a blocked button or a dropped result.
 * - **Every statement is *reported***, answered or not — asserted on the
 *   captured argument with `toStrictEqual`, because `toHaveBeenCalledWith`
 *   counts a key holding `undefined` as absent and would pass an empty result.
 * - **Done stays down once pressed**, because the caller's next act is a
 *   full-page navigation and a button that re-enables in that gap fires twice.
 */

const ITEMS = [
  { key: "learned", label: "I learned something new." },
  { key: "fun", label: "I had fun." },
  { key: "geduKnowledgeable", label: "My Gedu was knowledgeable and helpful." },
  { key: "geduKind", label: "My Gedu was friendly and kind." },
  { key: "groupListens", label: "My group listens to and understands me." },
] as const;

/** Every statement unanswered — the shape a screen nobody touched reports. */
const NO_ANSWERS = {
  learned: undefined,
  fun: undefined,
  geduKnowledgeable: undefined,
  geduKind: undefined,
  groupListens: undefined,
} as const;

type AskedKey = (typeof ITEMS)[number]["key"];

/** The five level words, as a reader meets them, in the order they charge. */
const WORDS = Object.values(SESSION_FEEDBACK_RATING_KEYS).map(
  (key) => messages.voice.feedback.scale[key],
);

function renderScreen(
  overrides: {
    onDone?: (result: SessionFeedbackResult<AskedKey>) => void;
    committing?: boolean;
    initial?: SessionFeedbackInitialState<AskedKey>;
    status?: string;
  } = {},
) {
  const onDone = overrides.onDone ?? vi.fn();
  // `rerender` is handed back so the seed-once test can hand the *same* mounted
  // screen a different `initial`, which is the only way to tell a value read
  // once from a value read on every render.
  const { rerender } = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SessionFeedbackScreen
        items={ITEMS}
        onDone={onDone}
        committing={overrides.committing ?? false}
        initial={overrides.initial}
        status={overrides.status}
      />
    </NextIntlClientProvider>,
  );
  return {
    onDone,
    reseed: (initial: SessionFeedbackInitialState<AskedKey>) => {
      rerender(
        <NextIntlClientProvider locale="en" messages={messages}>
          <SessionFeedbackScreen
            items={ITEMS}
            onDone={onDone}
            committing={overrides.committing ?? false}
            initial={initial}
            status={overrides.status}
          />
        </NextIntlClientProvider>,
      );
    },
  };
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

/** One statement — its sentence, its bar and its word line — as one block. */
function blockFor(label: string): HTMLElement {
  const block = screen.getByText(label).closest("div");
  if (block === null) throw new Error(`no statement block for "${label}"`);
  return block;
}

/** One statement's charge bar, resolved through the sentence above it. */
function barFor(label: string): HTMLElement {
  return within(blockFor(label)).getByRole("radiogroup");
}

/** One level's radio inside a bar, as the element that carries `checked`. */
function level(bar: HTMLElement, name: string): HTMLInputElement {
  const radio = within(bar).getByRole("radio", { name });
  if (!(radio instanceof HTMLInputElement)) {
    throw new Error(`"${name}" is not a native radio`);
  }
  return radio;
}

/**
 * The visible segment a reader taps — the `<label>` the radio sits inside, not
 * the sr-only radio itself.
 *
 * Every tap below goes through here on purpose. The split that makes the bar
 * work — the clear read from the click, the set read from the change — only
 * holds because a click on a label is forwarded to the control it labels, and
 * firing straight at the hidden input skips the forwarding: the test would pass
 * even if the visible half of the bar were wired to nothing.
 */
function segment(bar: HTMLElement, name: string): HTMLLabelElement {
  const label = level(bar, name).closest("label");
  if (label === null) throw new Error(`"${name}" has no visible segment`);
  return label;
}

/**
 * The line under a bar that holds the chosen level's word — found by what it is
 * (the statement's one status readout, which is how the level is announced)
 * rather than by where it happens to sit in the markup.
 */
function wordLine(label: string): HTMLElement {
  return within(blockFor(label)).getByRole("status");
}

/**
 * The words naming the two ends of the scale, in the order they are drawn.
 *
 * Found as the level words that appear in the statement's block *outside* the
 * bar and outside the answer readout — which is what an end label is. Doing it
 * that way rather than by walking the markup keeps the test indifferent to how
 * the row below the bar is built, and still fails if an end label goes missing,
 * doubles up, or quietly becomes the answer line.
 */
function endWords(label: string): string[] {
  const block = blockFor(label);
  const bar = barFor(label);
  const answer = wordLine(label);
  return WORDS.filter((word) =>
    within(block)
      .queryAllByText(word)
      .some((node) => !bar.contains(node) && node !== answer),
  );
}

describe("the session feedback screen", () => {
  // The screen scrolls the document to the top as it arrives, because it
  // replaces a room the reader may have scrolled a long way down. jsdom has no
  // layout to scroll and reports its own `scrollTo` unimplemented, so it is
  // stubbed here rather than branched around in the component.
  beforeAll(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  it("charges the bar to the level tapped and shows that level's word once", () => {
    renderScreen();
    const bar = barFor("I had fun.");

    fireEvent.click(segment(bar, "Yes"));

    expect(level(bar, "Yes").checked).toBe(true);
    expect(wordLine("I had fun.").textContent).toBe("Yes");
    // Once, not five times: the words left the segments when the bar became a
    // meter, so inside the bar each word survives exactly once — as a radio's
    // accessible name. A word drawn on a segment as well would make the lookup
    // ambiguous and this would throw.
    for (const word of WORDS) {
      expect(within(bar).getByText(word)).toBeDefined();
    }
  });

  it("puts the chosen word in the column of the segment that was tapped", () => {
    renderScreen();
    const bar = barFor("I had fun.");

    // Every level, because the placement is per-column and the two ends are the
    // ones that carry the alignment keeping a long word inside the bar.
    WORDS.forEach((word, index) => {
      fireEvent.click(segment(bar, word));
      expect(wordLine("I had fun.").getAttribute("data-column")).toBe(
        String(index + 1),
      );
    });
  });

  it("claims no column while the statement is unanswered", () => {
    renderScreen();
    const bar = barFor("I had fun.");

    // An empty line is under no segment, and a column attribute on it would be
    // a claim about a level nobody has chosen.
    expect(wordLine("I had fun.").hasAttribute("data-column")).toBe(false);

    fireEvent.click(segment(bar, "A bit"));
    fireEvent.click(segment(bar, "A bit"));

    expect(wordLine("I had fun.").hasAttribute("data-column")).toBe(false);
  });

  it("moves focus to the heading when it arrives", () => {
    renderScreen();

    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1 }),
    );
  });

  it("drains back when a lower segment is tapped", () => {
    renderScreen();
    const bar = barFor("I had fun.");

    fireEvent.click(segment(bar, "Yes"));
    fireEvent.click(segment(bar, "Not really"));

    expect(level(bar, "Not really").checked).toBe(true);
    expect(level(bar, "Yes").checked).toBe(false);
    expect(wordLine("I had fun.").textContent).toBe("Not really");
  });

  it("empties the bar when the level it is charged to is tapped again", () => {
    renderScreen();
    const bar = barFor("I had fun.");

    fireEvent.click(segment(bar, "Yes"));
    fireEvent.click(segment(bar, "Yes"));

    for (const word of WORDS) expect(level(bar, word).checked).toBe(false);
    expect(wordLine("I had fun.").textContent).toBe("");
  });

  it("reports a statement emptied by a second tap as a skip", () => {
    const { onDone, results } = captureDone();
    renderScreen({ onDone });
    const bar = barFor("I had fun.");

    fireEvent.click(segment(bar, "Yes"));
    fireEvent.click(segment(bar, "Yes"));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(results[0]).toStrictEqual({ answers: NO_ANSWERS, note: "" });
  });

  it("reserves the word line before anything is chosen", () => {
    renderScreen();

    for (const item of ITEMS) {
      expect(wordLine(item.label).textContent).toBe("");
    }
  });

  it("names both ends of the scale before anything is tapped", () => {
    renderScreen();

    // The direction has to be readable from an untouched bar: the rising
    // blocks say it in shape and these two words say it in language.
    for (const item of ITEMS) {
      expect(endWords(item.label)).toEqual(["No", "Definitely"]);
    }
  });

  it("trades the end words for the answer, and takes them back when it is cleared", () => {
    renderScreen();
    const bar = barFor("I had fun.");

    // The end words are a prompt, not a caption: they are there for the moment
    // before an answer and gone once there is one.
    fireEvent.click(segment(bar, "A bit"));
    expect(wordLine("I had fun.").textContent).toBe("A bit");
    expect(endWords("I had fun.")).toEqual([]);

    // ...and the question coming back brings its prompt back with it.
    fireEvent.click(segment(bar, "A bit"));
    expect(wordLine("I had fun.").textContent).toBe("");
    expect(endWords("I had fun.")).toEqual(["No", "Definitely"]);
  });

  it("leaves every other statement's end words alone when one is answered", () => {
    renderScreen();

    fireEvent.click(segment(barFor("I had fun."), "Yes"));

    expect(endWords("I had fun.")).toEqual([]);
    expect(endWords("I learned something new.")).toEqual(["No", "Definitely"]);
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
    expect(results[0]).toStrictEqual({ answers: NO_ANSWERS, note: "" });
    expect(Object.keys(results[0].answers)).toEqual(
      ITEMS.map((item) => item.key),
    );
  });

  it("reports the values picked and the note typed", () => {
    const { onDone, results } = captureDone();
    renderScreen({ onDone });

    fireEvent.click(segment(barFor("I had fun."), "Definitely"));
    fireEvent.click(segment(barFor("I learned something new."), "No"));

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "we built a castle" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(results[0]).toStrictEqual({
      answers: { ...NO_ANSWERS, fun: 5, learned: 1 },
      note: "we built a castle",
    });
  });

  it("offers the note field open and writable from the first paint", () => {
    renderScreen();

    // Present, enabled and writable — the three things that make it *open*.
    // What it says while empty is copy, and pinning that sentence here would
    // turn every rewrite of it into a failing test about something else.
    const field = screen.getByRole("textbox");
    expect(field.hasAttribute("disabled")).toBe(false);
    // And capped where the row is capped, so the field stops a reader rather
    // than letting them write a tail that is trimmed off on the way to storage.
    expect(field.getAttribute("maxlength")).toBe(
      String(SESSION_FEEDBACK_NOTE_MAX_LENGTH),
    );

    fireEvent.change(field, { target: { value: "hi" } });
    expect(screen.getByDisplayValue("hi")).toBe(field);
  });

  it("opens charged to the answers and note it was handed", () => {
    renderScreen({
      initial: { answers: { fun: 5, learned: 2 }, note: "we built a castle" },
    });

    expect(level(barFor("I had fun."), "Definitely").checked).toBe(true);
    expect(wordLine("I had fun.").textContent).toBe("Definitely");
    // Seeded and unanswered statements sit side by side, so a form opened on a
    // partial answer still says which way its untouched bars run.
    expect(endWords("I had fun.")).toEqual([]);
    expect(endWords("My Gedu was friendly and kind.")).toEqual([
      "No",
      "Definitely",
    ]);
    expect(screen.getByDisplayValue("we built a castle")).toBe(
      screen.getByRole("textbox"),
    );
  });

  it("reports what it opened with, merged with what the reader then did", () => {
    const { onDone, results } = captureDone();
    renderScreen({
      onDone,
      initial: { answers: { fun: 5, learned: 2 }, note: "we built a castle" },
    });

    // The three things a second visit can do to a seeded answer: leave it,
    // change it, and take it back off the record entirely.
    fireEvent.click(segment(barFor("I learned something new."), "Yes"));
    fireEvent.click(segment(barFor("My Gedu was friendly and kind."), "A bit"));
    fireEvent.click(segment(barFor("I had fun."), "Definitely"));

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "and a moat" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(results[0]).toStrictEqual({
      answers: { ...NO_ANSWERS, learned: 4, geduKind: 3 },
      note: "and a moat",
    });
  });

  it("does not re-seed when the initial state changes after it has mounted", () => {
    const { onDone, results } = captureDone();
    const { reseed } = renderScreen({
      onDone,
      initial: { answers: { fun: 5 }, note: "we built a castle" },
    });

    fireEvent.click(segment(barFor("I learned something new."), "No"));

    // A read resolving behind the reader. Whatever it brings is older than the
    // taps already made, so it must not reach the form.
    reseed({ answers: { fun: 1, groupListens: 1 }, note: "something else" });

    expect(level(barFor("I had fun."), "Definitely").checked).toBe(true);
    expect(
      level(barFor("My group listens to and understands me."), "No").checked,
    ).toBe(false);
    expect(screen.getByDisplayValue("we built a castle")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(results[0]).toStrictEqual({
      answers: { ...NO_ANSWERS, fun: 5, learned: 1 },
      note: "we built a castle",
    });
  });

  it("draws the caller's status line, above the button it is about", () => {
    // Already-translated copy, exactly like `lead`: the screen renders the
    // sentence it is handed, so a literal here is what a caller passes.
    renderScreen({ status: "These answers didn’t save. Try again." });

    const line = screen.getByText("These answers didn’t save. Try again.");
    const done = screen.getByRole("button", { name: "Done" });
    expect(
      line.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeGreaterThan(0);
  });

  it("draws nothing where the status line would go when there is none", () => {
    renderScreen();

    // Absence is the resting state: a form nobody has failed to save must look
    // exactly as it did before the prop existed, with no slot held open.
    expect(
      screen.queryByText("These answers didn’t save. Try again."),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Done" }).hasAttribute("disabled"),
    ).toBe(false);
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
