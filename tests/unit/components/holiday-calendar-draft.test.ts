import { describe, expect, it } from "vitest";
import {
  breakNameLanguages,
  breaksInDateOrder,
  checkHolidayBreak,
  emptyHolidayCalendarDraft,
  holidayCalendarDraft,
  holidayCalendarFailureReason,
  sameHolidayCalendarDraft,
  shownBreakName,
  validateHolidayCalendarDraft,
  withCommittedBreak,
  withoutBreakName,
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
      drafts: {
        fi: { b1: "Syysloma", "new-1": " Joululoma " },
        en: { b1: "Autumn break", "new-1": "Christmas break" },
      },
      active: "fi",
    },
  };
}

/** The draft with `patch` merged into its tabs. */
function withNames(
  draft: HolidayCalendarDraft,
  patch: HolidayCalendarDraft["names"]["drafts"],
): HolidayCalendarDraft {
  return { ...draft, names: { ...draft.names, drafts: { ...draft.names.drafts, ...patch } } };
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
    const draft = withNames(validDraft(), { fi: { b1: "Syysloma", "new-1": "  " } });
    expect(validateHolidayCalendarDraft(draft)).toEqual({
      ok: false,
      problem: { kind: "breakNameMissing", index: 1, locale: "fi" },
    });
  });

  it("asks for every break's name in a language partly named", () => {
    const draft = withNames(validDraft(), { sv: { "new-1": "Jullov" } });
    expect(validateHolidayCalendarDraft(draft)).toEqual({
      ok: false,
      problem: { kind: "breakNameMissing", index: 0, locale: "sv" },
    });
  });

  it("drops a language with no break named in it, rather than refusing it", () => {
    const blank = withNames(validDraft(), { sv: {} });
    const spaces = withNames(validDraft(), { sv: { b1: "  ", "new-1": "" } });
    const expected = validateHolidayCalendarDraft(validDraft());
    expect(expected.ok).toBe(true);
    expect(validateHolidayCalendarDraft(blank)).toEqual(expected);
    expect(validateHolidayCalendarDraft(spaces)).toEqual(expected);
  });

  it("refuses breaks named in no language at all, against the tab being shown", () => {
    const draft: HolidayCalendarDraft = {
      ...validDraft(),
      names: { drafts: { fi: {}, en: { b1: " " } }, active: "en" },
    };
    expect(validateHolidayCalendarDraft(draft)).toEqual({
      ok: false,
      problem: { kind: "breakNameMissing", index: 0, locale: "en" },
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
    expect(draft.names.drafts).toEqual({
      en: { b1: "Autumn break" },
      fi: { b1: "Syysloma" },
      sv: { b2: "Sportlov" },
    });
    expect(draft.breaks.map((entry) => [entry.key, entry.id])).toEqual([
      ["b1", "b1"],
      ["b2", "b2"],
    ]);
    expect(draft.names.active).toBe("fi");
  });

  it("opens a calendar with no breaks on one tab in the admin's locale", () => {
    const draft = holidayCalendarDraft({ name: "Empty", breaks: [] }, "sv");
    expect(draft.names).toEqual({ drafts: { sv: {} }, active: "sv" });
  });
});

describe("comparing a draft with what the form opened with", () => {
  it("is the same untouched, and on another tab", () => {
    const opened = validDraft();
    expect(sameHolidayCalendarDraft(validDraft(), opened)).toBe(true);
    const otherTab = { ...validDraft(), names: { ...validDraft().names, active: "en" as const } };
    expect(sameHolidayCalendarDraft(otherTab, opened)).toBe(true);
  });

  it("differs for the name, a date, a break added or removed, or a break's name", () => {
    const opened = validDraft();
    expect(sameHolidayCalendarDraft({ ...validDraft(), name: "Espoo schools" }, opened)).toBe(false);

    const moved = validDraft();
    moved.breaks[0] = { ...moved.breaks[0], endDate: "2030-10-21" };
    expect(sameHolidayCalendarDraft(moved, opened)).toBe(false);

    const removed = validDraft();
    removed.breaks = removed.breaks.slice(0, 1);
    expect(sameHolidayCalendarDraft(removed, opened)).toBe(false);

    const added = validDraft();
    added.breaks = [...added.breaks, { key: "new-2", id: null, startDate: "", endDate: "" }];
    expect(sameHolidayCalendarDraft(added, opened)).toBe(false);

    const renamed = withNames(validDraft(), { en: { b1: "Fall break", "new-1": "Christmas break" } });
    expect(sameHolidayCalendarDraft(renamed, opened)).toBe(false);

    const translated = withNames(validDraft(), { sv: { b1: "Höstlov" } });
    expect(sameHolidayCalendarDraft(translated, opened)).toBe(false);
  });

  it("ignores a blank tab, and spaces around a name", () => {
    const opened = validDraft();
    expect(sameHolidayCalendarDraft(withNames(validDraft(), { sv: {} }), opened)).toBe(true);
    const padded = withNames(validDraft(), { en: { b1: " Autumn break ", "new-1": "Christmas break" } });
    expect(sameHolidayCalendarDraft(padded, opened)).toBe(true);
  });
});

describe("removing a break", () => {
  it("takes its name out of every tab, so a tab naming only it reads as blank", () => {
    const tabs = withoutBreakName(
      { drafts: { fi: { b1: "Syysloma", b2: "Hiihtoloma" }, sv: { b2: "Sportlov" } }, active: "sv" },
      "b2",
    );
    expect(tabs).toEqual({ drafts: { fi: { b1: "Syysloma" }, sv: {} }, active: "sv" });
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

describe("committing a break from the break dialog", () => {
  it("replaces a break it already holds, and takes the dialog's languages", () => {
    const draft = validDraft();
    const names: HolidayCalendarDraft["names"] = {
      drafts: { ...draft.names.drafts, sv: { b1: "Höstlov" } },
      active: "sv",
    };
    const next = withCommittedBreak(
      draft,
      { key: "b1", id: "b1", startDate: "2030-10-13", endDate: "2030-10-20" },
      names,
    );
    expect(next.breaks).toHaveLength(2);
    expect(next.breaks[0].startDate).toBe("2030-10-13");
    expect(next.names).toBe(names);
  });

  it("adds a break it does not hold yet, at the end", () => {
    const draft = validDraft();
    const entry = { key: "new-2", id: null, startDate: "2030-02-17", endDate: "2030-02-23" };
    expect(withCommittedBreak(draft, entry, draft.names).breaks.at(-1)).toBe(entry);
  });
});

describe("listing breaks", () => {
  it("lists them by first day without reordering the draft", () => {
    const { breaks } = validDraft();
    const reversed = [breaks[1], breaks[0]];
    expect(breaksInDateOrder(reversed).map((entry) => entry.key)).toEqual(["b1", "new-1"]);
    expect(reversed[0].key).toBe("new-1");
  });

  it("shows a break's name in the admin's language, else English, else the first", () => {
    const { names } = validDraft();
    expect(shownBreakName(names, "b1", "fi")).toEqual({ locale: "fi", name: "Syysloma" });
    expect(shownBreakName(names, "b1", "sv")).toEqual({ locale: "en", name: "Autumn break" });
    const finnishOnly: HolidayCalendarDraft["names"] = {
      drafts: { fi: { b1: "Syysloma" }, en: { b1: " " } },
      active: "en",
    };
    expect(shownBreakName(finnishOnly, "b1", "sv")).toEqual({ locale: "fi", name: "Syysloma" });
    expect(shownBreakName(finnishOnly, "b2", "sv")).toBeNull();
  });

  it("says which of the calendar's languages a break is named in", () => {
    const names: HolidayCalendarDraft["names"] = {
      drafts: { fi: { b1: "Syysloma" }, en: {}, sv: { b1: "  " } },
      active: "fi",
    };
    expect(breakNameLanguages(names, "b1")).toEqual([
      { locale: "en", named: false },
      { locale: "fi", named: true },
      { locale: "sv", named: false },
    ]);
  });
});

describe("checking one break in the break dialog", () => {
  const names: HolidayCalendarDraft["names"] = {
    drafts: { fi: { b1: "Syysloma" }, en: { b1: "Autumn break" } },
    active: "fi",
  };
  const dated = { key: "b1", id: null, startDate: "2030-10-14", endDate: "2030-10-20" };

  it("asks for both days, and refuses an end before the start", () => {
    expect(checkHolidayBreak({ ...dated, endDate: "" }, names)).toEqual({ kind: "datesRequired" });
    expect(checkHolidayBreak({ ...dated, endDate: "2030-10-13" }, names)).toEqual({
      kind: "endBeforeStart",
    });
    expect(checkHolidayBreak({ ...dated, endDate: "2030-10-14" }, names)).toBeNull();
  });

  it("asks for a name in every open tab, an empty one included", () => {
    expect(checkHolidayBreak(dated, names)).toBeNull();
    expect(
      checkHolidayBreak(dated, { ...names, drafts: { ...names.drafts, sv: {} } }),
    ).toEqual({ kind: "nameMissing", locale: "sv" });
  });
});
