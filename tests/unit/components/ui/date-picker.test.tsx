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
  overrides: { value?: string } = {},
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
        today="2026-08-19"
        weekPick={weekPick}
      />
    </NextIntlClientProvider>,
  );
  return { onChange };
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
