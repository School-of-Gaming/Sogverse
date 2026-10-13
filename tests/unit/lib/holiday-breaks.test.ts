import { describe, it, expect } from "vitest";
import { breakContaining, breakName, holidayBreakRows } from "@/lib/holiday-breaks";

const ROWS = holidayBreakRows.parse([
  {
    id: "a",
    start_date: "2030-10-14",
    end_date: "2030-10-18",
    names: [
      { locale: "en", name: "Autumn break" },
      { locale: "fi", name: "Syysloma" },
    ],
    withdrawn_sessions: [
      {
        session_date: "2030-10-14",
        starts_at: "2030-10-14T10:00:00+00:00",
        ends_at: "2030-10-14T11:00:00+00:00",
      },
    ],
  },
  {
    id: "b",
    start_date: "2030-10-18",
    end_date: "2030-10-22",
    names: [{ locale: "sv", name: "Studiedagar" }],
    withdrawn_sessions: [],
  },
]);

describe("holidayBreakRow", () => {
  it("parses the document's row into the app's shape", () => {
    expect(ROWS[0]).toEqual({
      id: "a",
      startDate: "2030-10-14",
      endDate: "2030-10-18",
      names: [
        { locale: "en", name: "Autumn break" },
        { locale: "fi", name: "Syysloma" },
      ],
      withdrawnSessions: [
        {
          date: "2030-10-14",
          startsAt: new Date("2030-10-14T10:00:00Z"),
          endsAt: new Date("2030-10-14T11:00:00Z"),
          cancelled: false,
        },
      ],
    });
  });

  it("refuses a key the document does not define", () => {
    expect(() =>
      holidayBreakRows.parse([
        { id: "c", start_date: "2030-01-01", end_date: "2030-01-01", names: [], withdrawn_sessions: [], calendar_name: "x" },
      ]),
    ).toThrow();
  });
});

describe("breakName", () => {
  it("reads the reader's locale, then English, then the first written", () => {
    expect(breakName(ROWS[0], "fi")).toBe("Syysloma");
    expect(breakName(ROWS[0], "sv")).toBe("Autumn break");
    expect(breakName(ROWS[1], "fr")).toBe("Studiedagar");
  });
});

describe("breakContaining", () => {
  it("finds the break a date falls in, both ends inclusive, the earliest where two overlap", () => {
    expect(breakContaining(ROWS, "2030-10-14")?.id).toBe("a");
    expect(breakContaining(ROWS, "2030-10-18")?.id).toBe("a");
    expect(breakContaining(ROWS, "2030-10-22")?.id).toBe("b");
    expect(breakContaining(ROWS, "2030-10-23")).toBeNull();
  });
});
