import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { DatePicker, type WeekPick } from "@/components/ui/date-picker";

/**
 * **The week picker, as the admin who plans in week numbers meets it.**
 *
 * The native date input is the browser's and is not retested here. What is
 * tested is everything the control adds on top of it, and the claims worth
 * pinning are the ones a visual review cannot make:
 *
 *   - **A week is seven days, so picking one is only an answer once the field
 *     says which of the seven it wants.** A start field on a Wednesday club has
 *     to answer with that week's Wednesday and an end field with the same day
 *     read from the other end. Getting that backwards would store a term that
 *     begins two days before its first session — the exact defect
 *     `session-dates.ts` exists to prevent — and it looks completely correct on
 *     screen.
 *   - **Every date that leaves the control is a bare `YYYY-MM-DD`**, produced by
 *     UTC-pinned arithmetic. A picker that built a `Date` and read a local field
 *     off it would pass in Helsinki and land a day out for half the planet.
 *   - **The dialog gives focus back.** A popover that closes into nowhere leaves
 *     a keyboard user at the top of the form.
 *
 * The real English messages are used rather than key-echoing stubs, because two
 * of these assertions are about interpolated values — the week the trigger
 * reads back, and the week a gutter button names.
 */

/** A Wednesday club: `schedule_slots.weekday` counts 0 = Monday. */
const WEDNESDAY: readonly number[] = [2];

/** 2026-W34 runs Mon 17 August to Sun 23 August; its Wednesday is the 19th. */
const WEEK_34_WEDNESDAY = "2026-08-19";

function renderPicker(
  weekPick: WeekPick,
  overrides: {
    value?: string;
    today?: string;
    rangeStart?: string;
    rangeEnd?: string;
  } = {},
) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
      timeZone="Europe/Helsinki"
    >
      <DatePicker
        id="term-start"
        value={overrides.value ?? WEEK_34_WEDNESDAY}
        onChange={onChange}
        today={overrides.today ?? "2026-08-19"}
        weekPick={weekPick}
        rangeStart={overrides.rangeStart ?? null}
        rangeEnd={overrides.rangeEnd ?? null}
      />
    </NextIntlClientProvider>,
  );
  return { onChange };
}

/** The open popover, as a node the day cells can be looked up inside. */
function panel(): HTMLElement {
  const found = dialog();
  if (found === null) throw new Error("the calendar is not open");
  return found;
}

/** One day cell, by the bare date it carries. */
function cell(date: string): HTMLElement {
  const found = panel().querySelector<HTMLElement>(`[data-date="${date}"]`);
  if (found === null) throw new Error(`no cell for ${date}`);
  return found;
}

/** Which classes an element carries, as a set to ask membership questions of. */
function classes(el: HTMLElement): Set<string> {
  return new Set(el.className.split(/\s+/).filter(Boolean));
}

/** The one affordance that opens the calendar. */
const trigger = () => screen.getByRole("button", { name: "Open calendar" });
const dialog = () => screen.queryByRole("dialog", { name: "Open calendar" });

afterEach(cleanup);

describe("the week button", () => {
  it("reads back the ISO week of the value", () => {
    // 2026-08-19 is in week 34 — the week a Finnish admin would have said out
    // loud before ever opening the form.
    renderPicker({ edge: "start", weekdays: WEDNESDAY });
    expect(trigger().textContent).toContain("wk 34");
  });

  it("shows no week for an empty field", () => {
    renderPicker({ edge: "start", weekdays: WEDNESDAY }, { value: "" });
    expect(trigger().textContent).not.toContain("wk");
  });

  it("opens and closes the calendar", () => {
    renderPicker({ edge: "start", weekdays: WEDNESDAY });
    expect(dialog()).toBeNull();
    fireEvent.click(trigger());
    expect(dialog()).not.toBeNull();
    fireEvent.click(trigger());
    expect(dialog()).toBeNull();
  });
});

describe("picking a day", () => {
  it("answers with the bare date and closes", () => {
    const { onChange } = renderPicker({ edge: "start", weekdays: WEDNESDAY });
    fireEvent.click(trigger());

    const panel = dialog();
    expect(panel).not.toBeNull();
    if (panel === null) return;
    const cell = panel.querySelector('[data-date="2026-08-25"]');
    expect(cell).not.toBeNull();
    if (cell === null) return;
    fireEvent.click(cell);

    expect(onChange).toHaveBeenCalledWith("2026-08-25");
    expect(dialog()).toBeNull();
  });
});

describe("picking a week", () => {
  it("answers a start field with the week's first session day", () => {
    const { onChange } = renderPicker({ edge: "start", weekdays: WEDNESDAY });
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("button", { name: "Select week 34" }));

    // Monday the 17th is in the week; the club's first session is Wednesday.
    expect(onChange).toHaveBeenCalledWith(WEEK_34_WEDNESDAY);
    expect(dialog()).toBeNull();
  });

  it("answers an end field with the week's last session day", () => {
    const { onChange } = renderPicker({ edge: "end", weekdays: WEDNESDAY });
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("button", { name: "Select week 34" }));

    // Read from Sunday the 23rd backwards, the last session is the same
    // Wednesday — a one-session-a-week club's two edges meet on one day.
    expect(onChange).toHaveBeenCalledWith(WEEK_34_WEDNESDAY);
  });

  it("falls back to Monday and Sunday with no schedule to snap to", () => {
    const { onChange } = renderPicker({ edge: "end", weekdays: [] });
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("button", { name: "Select week 34" }));
    expect(onChange).toHaveBeenCalledWith("2026-08-23");
  });
});

describe("the go-to-week box", () => {
  /**
   * The dialog opens ready for the fastest path there is — an admin reading
   * "vk 35–49" off a sheet of paper types the number. It also opens *visibly*
   * ready: the opening focus was on a day cell, which Chrome draws no ring for
   * when it was set after a pointer click, so the only focused thing on screen
   * was invisible while the box's placeholder looked like a control waiting for
   * a number. Digits went to the grid and were swallowed.
   */
  it("takes the opening focus", () => {
    renderPicker({ edge: "start", weekdays: WEDNESDAY });
    fireEvent.click(trigger());

    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Week number" }),
    );
  });

  it("takes the digits typed straight after opening", () => {
    renderPicker({ edge: "start", weekdays: WEDNESDAY });
    fireEvent.click(trigger());

    const box = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Week number",
    });
    fireEvent.change(box, { target: { value: "37" } });

    // The text is in the box the admin thought they were typing into, and the
    // week it names is previewed. 2026-W37 is Mon 7 to Sun 13 September; its
    // Wednesday is the 9th.
    expect(box.value).toBe("37");
    expect(cell("2026-09-09").dataset.previewTarget).toBe("true");
    // Nothing pulls the caret out from under the next keystroke: the roving
    // index moved with the preview, but DOM focus did not follow it.
    expect(document.activeElement).toBe(box);
  });

  it("selects the typed week on Enter", () => {
    const { onChange } = renderPicker({ edge: "start", weekdays: WEDNESDAY });
    fireEvent.click(trigger());

    const box = screen.getByRole("textbox", { name: "Week number" });
    fireEvent.change(box, { target: { value: "36" } });
    fireEvent.keyDown(box, { key: "Enter" });

    // 2026-W36 is Mon 31 August to Sun 6 September; its Wednesday is 2 Sept.
    expect(onChange).toHaveBeenCalledWith("2026-09-02");
    expect(dialog()).toBeNull();
  });

  /**
   * The box answers as it is typed. A control that sits inert until Enter reads
   * as broken — the admin types a number, nothing on screen acknowledges it, and
   * the only way to find out whether it was understood is to commit it.
   */
  it("navigates to the typed week's month and previews its target day", () => {
    const { onChange } = renderPicker({ edge: "start", weekdays: WEDNESDAY });
    fireEvent.click(trigger());

    const box = screen.getByRole("textbox", { name: "Week number" });
    // 2026-W40 is Mon 28 September to Sun 4 October; its Wednesday is the 30th.
    fireEvent.change(box, { target: { value: "40" } });

    expect(within(panel()).getByText("September 2026")).not.toBeNull();
    expect(cell("2026-09-30").dataset.previewTarget).toBe("true");
    // A preview is not an answer: nothing is selected and the field is untouched
    // until Enter or a click says so.
    expect(cell("2026-09-30").getAttribute("aria-selected")).toBe("false");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the preview when the text stops resolving", () => {
    renderPicker({ edge: "start", weekdays: WEDNESDAY });
    fireEvent.click(trigger());

    const box = screen.getByRole("textbox", { name: "Week number" });
    fireEvent.change(box, { target: { value: "40" } });
    expect(panel().querySelector("[data-preview-target]")).not.toBeNull();

    fireEvent.change(box, { target: { value: "4x" } });
    expect(panel().querySelector("[data-preview-target]")).toBeNull();
  });

  it("does nothing an unrecognised week could be mistaken for", () => {
    const { onChange } = renderPicker({ edge: "start", weekdays: WEDNESDAY });
    fireEvent.click(trigger());

    const box = screen.getByRole("textbox", { name: "Week number" });
    fireEvent.change(box, { target: { value: "99" } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
  });
});

describe("Escape", () => {
  it("closes the calendar and hands focus back to the week button", () => {
    renderPicker({ edge: "start", weekdays: WEDNESDAY });
    fireEvent.click(trigger());
    expect(dialog()).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});

describe("focus leaving the calendar", () => {
  /**
   * Tab is not Escape: the admin has already sent focus into the form behind
   * the popover, so the calendar closes and focus is left exactly where they
   * put it. A dialog that stays open over the field being typed into is the
   * defect; pulling focus back would be a second one.
   */
  it("closes when focus lands outside the control", () => {
    renderPicker({ edge: "start", weekdays: WEDNESDAY });
    fireEvent.click(trigger());
    expect(dialog()).not.toBeNull();

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    fireEvent.focusOut(trigger(), { relatedTarget: outside });

    expect(dialog()).toBeNull();
    expect(document.activeElement).not.toBe(trigger());
    outside.remove();
  });

  it("stays open while focus moves inside it", () => {
    renderPicker({ edge: "start", weekdays: WEDNESDAY });
    fireEvent.click(trigger());

    const gutter = screen.getByRole("button", { name: "Select week 34" });
    fireEvent.focusOut(trigger(), { relatedTarget: gutter });

    expect(dialog()).not.toBeNull();
  });
});

describe("the grid", () => {
  it("names its gutter and its weekdays out of Intl, never a label array", () => {
    renderPicker({ edge: "start", weekdays: WEDNESDAY });
    fireEvent.click(trigger());

    const panel = dialog();
    expect(panel).not.toBeNull();
    if (panel === null) return;
    // The English short names, Monday first — the order the ISO week runs in
    // and the order `schedule_slots.weekday` counts in.
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(within(panel).getAllByText(day).length).toBeGreaterThan(0);
    }
  });
});

/**
 * Three marks share one cell — today, the term's band, and the day a previewed
 * week would answer with — so what is pinned here is that each is drawn in a
 * layer the others cannot cover. A ring is a box shadow outside the cell, which
 * the neighbour's band ground paints over and an act fill swallows, so today is
 * ink and every ring is inset.
 */
describe("how a day cell is marked", () => {
  it("marks today with ink and no ring", () => {
    renderPicker(
      { edge: "start", weekdays: WEDNESDAY },
      { value: WEEK_34_WEDNESDAY, today: "2026-08-20" },
    );
    fireEvent.click(trigger());

    const todayCell = cell("2026-08-20");
    expect(todayCell.getAttribute("aria-current")).toBe("date");
    expect(classes(todayCell)).toContain("text-act");
    expect([...classes(todayCell)].filter((c) => c.startsWith("ring-"))).toEqual(
      [],
    );
  });

  it("draws the band as one bar, capped only where the run ends", () => {
    renderPicker(
      { edge: "start", weekdays: WEDNESDAY },
      { value: WEEK_34_WEDNESDAY, rangeEnd: "2026-08-28" },
    );
    fireEvent.click(trigger());

    // Friday the 21st sits inside the run with a banded neighbour either side.
    const interior = classes(cell("2026-08-21"));
    expect(interior).toContain("bg-lifted");
    expect(interior).toContain("rounded-none");
    expect(interior).not.toContain("rounded-l-sm");
    expect(interior).not.toContain("rounded-r-sm");

    // Friday the 28th is the far end, so the bar stops there and is capped.
    const end = classes(cell("2026-08-28"));
    expect(end).toContain("bg-lifted");
    expect(end).toContain("rounded-r-sm");
  });
});
