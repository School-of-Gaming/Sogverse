import { describe, it, expect } from "vitest";
import {
  buildIcsCalendar,
  escapeText,
  foldLine,
  formatUtcTimestamp,
  formatZonedTimestamp,
  type IcsEvent,
} from "@/lib/calendar-feed/ics";

const DTSTAMP = new Date("2026-09-03T08:00:00.000Z");
const START = new Date("2026-09-07T13:30:00.000Z");
const END = new Date("2026-09-07T15:00:00.000Z");

const encoder = new TextEncoder();

function baseEvent(overrides: Partial<IcsEvent> = {}): IcsEvent {
  return {
    uid: "seat-1-2026-09-07-0@sogverse",
    start: { instant: START, tzid: null },
    end: { instant: END, tzid: null },
    summary: "Minecraft Club",
    transparent: true,
    ...overrides,
  };
}

function build(events: IcsEvent[], extra: { color?: string | null } = {}) {
  return buildIcsCalendar({
    calendarName: "School of Gaming",
    dtstamp: DTSTAMP,
    events,
    ...extra,
  });
}

/** The document as unfolded logical lines, which is what a parser sees. */
function logicalLines(document: string): string[] {
  return document.replace(/\r\n /g, "").split("\r\n").filter(Boolean);
}

describe("ics line folding", () => {
  it("leaves a line at or under 75 octets alone", () => {
    const line = "SUMMARY:" + "a".repeat(67);
    expect(encoder.encode(line).length).toBe(75);
    expect(foldLine(line)).toBe(line);
  });

  it("folds a long ASCII line with CRLF + space, every line within 75 octets", () => {
    const folded = foldLine("DESCRIPTION:" + "a".repeat(300));
    expect(folded).toContain("\r\n ");
    for (const line of folded.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  /**
   * The reason folding counts octets rather than characters: a Finnish or
   * Swedish product name is full of two-byte letters, so a character-counted
   * fold silently emits over-long lines. Ninety "ä" is 90 characters and 180
   * bytes.
   */
  it("counts octets, not characters, on multibyte text", () => {
    const folded = foldLine("SUMMARY:" + "ä".repeat(90));
    for (const line of folded.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    // Nothing lost and nothing added: unfolding restores the original.
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "ä".repeat(90));
  });

  it("never splits a multibyte character across a fold", () => {
    const folded = foldLine("SUMMARY:" + "日".repeat(60));
    for (const line of folded.split("\r\n")) {
      // A split sequence would decode to U+FFFD on the way back out.
      expect(line).not.toContain("�");
    }
  });
});

describe("ics text escaping", () => {
  it("escapes backslash, semicolon, comma and newlines", () => {
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("escapes the backslash first, so an escape is not re-escaped", () => {
    expect(escapeText("\\;")).toBe("\\\\\\;");
  });

  it("leaves a colon alone — TEXT does not escape it", () => {
    expect(escapeText("16:30")).toBe("16:30");
  });
});

describe("ics timestamps", () => {
  it("writes a UTC instant in the Z form", () => {
    expect(formatUtcTimestamp(START)).toBe("20260907T133000Z");
  });

  it("writes a wall clock in the named zone", () => {
    // Helsinki is EEST (+03:00) in September.
    expect(formatZonedTimestamp(START, "Europe/Helsinki")).toBe(
      "20260907T163000",
    );
  });
});

describe("ics calendar document", () => {
  it("uses CRLF throughout and terminates the last line", () => {
    const document = build([baseEvent()]);
    expect(document.endsWith("END:VCALENDAR\r\n")).toBe(true);
    // No bare LF anywhere.
    expect(document.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("carries the calendar preamble", () => {
    const lines = logicalLines(build([baseEvent()]));
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("PRODID:-//School of Gaming//Sogverse//EN");
    expect(lines).toContain("CALSCALE:GREGORIAN");
    expect(lines).toContain("METHOD:PUBLISH");
    expect(lines).toContain("X-WR-CALNAME:School of Gaming");
  });

  /**
   * The UID is what makes a poll an update rather than a duplicate, so it has
   * to be a function of the seat and the date and of nothing that changes
   * between two fetches.
   */
  it("emits the same UID for the same event across two builds", () => {
    const first = logicalLines(build([baseEvent()]));
    const second = logicalLines(
      buildIcsCalendar({
        calendarName: "School of Gaming",
        dtstamp: new Date("2026-09-04T09:15:00.000Z"),
        events: [baseEvent()],
      }),
    );
    expect(first).toContain("UID:seat-1-2026-09-07-0@sogverse");
    expect(second).toContain("UID:seat-1-2026-09-07-0@sogverse");
    // Only the poll stamp differs.
    expect(first).toContain("DTSTAMP:20260903T080000Z");
    expect(second).toContain("DTSTAMP:20260904T091500Z");
  });

  it("emits DTSTART, DTEND, SUMMARY and TRANSP for every event", () => {
    const lines = logicalLines(build([baseEvent()]));
    expect(lines).toContain("DTSTART:20260907T133000Z");
    expect(lines).toContain("DTEND:20260907T150000Z");
    expect(lines).toContain("SUMMARY:Minecraft Club");
    expect(lines).toContain("TRANSP:TRANSPARENT");
  });

  it("emits OPAQUE when the event is not transparent", () => {
    const lines = logicalLines(build([baseEvent({ transparent: false })]));
    expect(lines).toContain("TRANSP:OPAQUE");
  });

  it("emits no VALARM when the event carries none", () => {
    expect(build([baseEvent()])).not.toContain("BEGIN:VALARM");
  });

  it("emits one VALARM with its trigger and description when it does", () => {
    const lines = logicalLines(
      build([
        baseEvent({
          alarm: { minutesBefore: 60, description: "Minecraft Club" },
        }),
      ]),
    );
    expect(lines).toContain("BEGIN:VALARM");
    expect(lines).toContain("ACTION:DISPLAY");
    expect(lines).toContain("TRIGGER:-PT60M");
    expect(lines).toContain("DESCRIPTION:Minecraft Club");
    expect(lines.filter((line) => line === "BEGIN:VALARM")).toHaveLength(1);
  });

  it("emits an RRULE with an UNTIL when the event carries one", () => {
    const lines = logicalLines(
      build([
        baseEvent({
          start: { instant: START, tzid: "Europe/Helsinki" },
          end: { instant: END, tzid: "Europe/Helsinki" },
          rrule: "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261215T215959Z",
        }),
      ]),
    );
    expect(lines).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261215T215959Z");
    expect(lines).toContain("DTSTART;TZID=Europe/Helsinki:20260907T163000");
  });

  it("emits no VTIMEZONE when every event states a UTC instant", () => {
    expect(build([baseEvent()])).not.toContain("BEGIN:VTIMEZONE");
  });

  it("emits the Helsinki VTIMEZONE exactly when an event names that zone", () => {
    const document = build([
      baseEvent({
        start: { instant: START, tzid: "Europe/Helsinki" },
        end: { instant: END, tzid: "Europe/Helsinki" },
      }),
    ]);
    const lines = logicalLines(document);
    expect(lines).toContain("BEGIN:VTIMEZONE");
    expect(lines).toContain("TZID:Europe/Helsinki");
    expect(lines).toContain("TZOFFSETTO:+0300");
    expect(lines).toContain("TZOFFSETTO:+0200");
    expect(lines).toContain("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU");
    expect(lines).toContain("RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU");
    expect(lines.filter((line) => line === "BEGIN:VTIMEZONE")).toHaveLength(1);
  });

  it("notes an unsupported zone instead of inventing a VTIMEZONE for it", () => {
    const document = build([
      baseEvent({
        start: { instant: START, tzid: "America/New_York" },
        end: { instant: END, tzid: "America/New_York" },
      }),
    ]);
    expect(document).not.toContain("BEGIN:VTIMEZONE");
    expect(document).toContain("X-SOGVERSE-NOTE:");
    expect(document.replace(/\r\n /g, "")).toContain("America/New_York");
  });

  it("emits the colour and refresh hints only when asked for them", () => {
    const bare = build([baseEvent()]);
    expect(bare).not.toContain("X-APPLE-CALENDAR-COLOR");
    expect(bare).not.toContain("REFRESH-INTERVAL");

    const dressed = buildIcsCalendar({
      calendarName: "School of Gaming",
      color: "#FAA901",
      refreshDuration: "PT1H",
      dtstamp: DTSTAMP,
      events: [baseEvent()],
    });
    const lines = logicalLines(dressed);
    expect(lines).toContain("X-APPLE-CALENDAR-COLOR:#FAA901");
    expect(lines).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
    expect(lines).toContain("X-PUBLISHED-TTL:PT1H");
  });

  it("escapes a summary that carries reserved characters", () => {
    const lines = logicalLines(
      build([baseEvent({ summary: "Club; camp, and more\\" })]),
    );
    expect(lines).toContain("SUMMARY:Club\\; camp\\, and more\\\\");
  });

  it("leaves a URL unescaped — it is a URI, not TEXT", () => {
    const lines = logicalLines(
      build([
        baseEvent({ url: "https://example.test/parent/clubs/abc?x=1,2" }),
      ]),
    );
    expect(lines).toContain("URL:https://example.test/parent/clubs/abc?x=1,2");
  });
});
