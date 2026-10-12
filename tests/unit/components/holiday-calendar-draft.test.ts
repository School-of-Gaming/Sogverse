import { describe, expect, it } from "vitest";
import {
  emptyHolidayCalendarDraft,
  holidayCalendarDraft,
  holidayCalendarFailureReason,
  validateHolidayCalendarDraft,
  type HolidayCalendarDraft,
} from "@/components/admin/holiday-calendars/holiday-calendar-draft";
import { holidayCalendarInput } from "@/services/holiday-calendars";

/**
 * The holiday calendar form's draft: what it refuses before anything is asked
 * of the database, and the payload it hands the writers when it holds.
 */

/** Two breaks named in English and Finnish, the second a new row. */
function validDraft(): HolidayCalendarDraft {
  return {
    name: "  Helsinki schools ",
    breaks: [
      { key: "b1", id: "b1", startDate: "2030-10-14", endDate: "2030-10-20" },
      { key: "new-1", id: null, startDate: "2030-12-21", endDate: "2031-01-06" },
    ],
    names: {
      fi: { b1: "Syysloma", "new-1": " Joululoma " },
      en: { b1: "Autumn break", "new-1": "Christmas break" },
    },
    activeLocale: "fi",
  };
}

describe("validating a holiday calendar draft", () => {
  it("builds the writers' payload: trimmed, every calendar language per break", () => {
    const result = validateHolidayCalendarDraft(validDraft());
    expect(result).toEqual({
      ok: true,
      input: {
        name: "Helsinki schools",
        breaks: [
          {
            id: "b1",
            start_date: "2030-10-14",
            end_date: "2030-10-20",
            names: [
              { locale: "en", name: "Autumn break" },
              { locale: "fi", name: "Syysloma" },
            ],
          },
          {
            id: null,
            start_date: "2030-12-21",
            end_date: "2031-01-06",
            names: [
              { locale: "en", name: "Christmas break" },
              { locale: "fi", name: "Joululoma" },
            ],
          },
        ],
      },
    });
    // And it is a payload the service's own contract accepts.
    if (result.ok) expect(holidayCalendarInput.safeParse(result.input).success).toBe(true);
  });

  it("accepts a calendar with no breaks", () => {
    const draft = { ...emptyHolidayCalendarDraft("en"), name: "Empty" };
    expect(validateHolidayCalendarDraft(draft)).toEqual({
      ok: true,
      input: { name: "Empty", breaks: [] },
    });
  });

  it("asks for a name", () => {
    const draft = { ...validDraft(), name: "   " };
    expect(validateHolidayCalendarDraft(draft)).toEqual({
      ok: false,
      problem: { kind: "nameRequired" },
    });
  });

  it("asks for both days of a break", () => {
    const draft = validDraft();
    draft.breaks[1] = { ...draft.breaks[1], endDate: "" };
    expect(validateHolidayCalendarDraft(draft)).toEqual({
      ok: false,
      problem: { kind: "datesRequired", index: 1 },
    });
  });

  it("refuses a break that ends before it begins, and allows a one-day break", () => {
    const draft = validDraft();
    draft.breaks[0] = { ...draft.breaks[0], startDate: "2030-10-20", endDate: "2030-10-14" };
    expect(validateHolidayCalendarDraft(draft)).toEqual({
      ok: false,
      problem: { kind: "endBeforeStart", index: 0 },
    });

    draft.breaks[0] = { ...draft.breaks[0], startDate: "2030-10-14", endDate: "2030-10-14" };
    expect(validateHolidayCalendarDraft(draft).ok).toBe(true);
  });

  it("names the first break missing a name, and the language it is missing in", () => {
    const draft = validDraft();
    draft.names = { ...draft.names, fi: { b1: "Syysloma", "new-1": "  " } };
    expect(validateHolidayCalendarDraft(draft)).toEqual({
      ok: false,
      problem: { kind: "breakNameMissing", index: 1, locale: "fi" },
    });
  });

  it("asks for every break's name in a newly added language", () => {
    const draft = validDraft();
    draft.names = { ...draft.names, sv: {} };
    expect(validateHolidayCalendarDraft(draft)).toEqual({
      ok: false,
      problem: { kind: "breakNameMissing", index: 0, locale: "sv" },
    });
  });

  it("refuses two breaks sharing a day, both ends included", () => {
    const draft = validDraft();
    draft.breaks[1] = { ...draft.breaks[1], startDate: "2030-10-20", endDate: "2030-10-22" };
    expect(validateHolidayCalendarDraft(draft)).toEqual({
      ok: false,
      problem: { kind: "overlap", first: 0, second: 1 },
    });

    // A break starting the day after the other ends does not overlap it.
    draft.breaks[1] = { ...draft.breaks[1], startDate: "2030-10-21" };
    expect(validateHolidayCalendarDraft(draft).ok).toBe(true);
  });

  it("finds an overlap whatever order the rows are in", () => {
    const draft = validDraft();
    draft.breaks = [
      draft.breaks[1],
      { ...draft.breaks[0], startDate: "2031-01-01", endDate: "2031-01-02" },
    ];
    expect(validateHolidayCalendarDraft(draft)).toEqual({
      ok: false,
      problem: { kind: "overlap", first: 0, second: 1 },
    });
  });
});

describe("opening a stored calendar", () => {
  it("takes every language any break is named in, and keeps break ids", () => {
    const draft = holidayCalendarDraft(
      {
        name: "Helsinki schools",
        breaks: [
          {
            id: "b1",
            startDate: "2030-10-14",
            endDate: "2030-10-20",
            names: [
              { locale: "fi", name: "Syysloma" },
              { locale: "en", name: "Autumn break" },
            ],
          },
          {
            id: "b2",
            startDate: "2031-02-17",
            endDate: "2031-02-23",
            names: [{ locale: "sv", name: "Sportlov" }],
          },
        ],
      },
      "fi",
    );
    expect(draft.names).toEqual({
      en: { b1: "Autumn break" },
      fi: { b1: "Syysloma" },
      sv: { b2: "Sportlov" },
    });
    expect(draft.breaks.map((entry) => [entry.key, entry.id])).toEqual([
      ["b1", "b1"],
      ["b2", "b2"],
    ]);
    expect(draft.activeLocale).toBe("fi");
  });

  it("opens a calendar with no breaks on one tab in the admin's locale", () => {
    const draft = holidayCalendarDraft({ name: "Empty", breaks: [] }, "sv");
    expect(draft.names).toEqual({ sv: {} });
    expect(draft.activeLocale).toBe("sv");
  });
});

describe("a refusal off the wire", () => {
  it("is shown as the database wrote it", () => {
    expect(
      holidayCalendarFailureReason({
        code: "23514",
        message: 'Another calendar is already called "Helsinki schools"',
      }),
    ).toBe('Another calendar is already called "Helsinki schools"');
  });

  it("has nothing to quote when it is not an error with a message", () => {
    expect(holidayCalendarFailureReason(null)).toBeNull();
    expect(holidayCalendarFailureReason({ message: "" })).toBeNull();
    expect(holidayCalendarFailureReason("boom")).toBeNull();
  });
});
