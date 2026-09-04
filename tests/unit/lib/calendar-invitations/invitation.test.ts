import { describe, it, expect } from "vitest";
import {
  buildInvitation,
  type InvitationInput,
} from "@/lib/calendar-invitations/invitation";

/**
 * The calendar document, asserted on the bytes that leave the building.
 *
 * A client is handed a string and nothing else, so what is wrong with an
 * invitation is a property of that string: a repeated `DTSTART`, a `BYDAY` in
 * the wrong order, an unescaped semicolon, a line folded by characters instead
 * of octets. None of those are visible from the input, and every one of them is
 * a real client's silently wrong entry.
 *
 * **The clock is fixed.** `now` decides which sessions are still ahead, so a
 * test that read the wall clock would pass all summer and fail one Monday.
 * Every case below states its own.
 */

/** Monday 7 September 2026, 08:00 in Helsinki — before that day's 16:00 session. */
const NOW = new Date("2026-09-07T05:00:00Z");

/** A camp on Monday, Wednesday and Friday for four weeks. Twelve sessions. */
function input(overrides: Partial<InvitationInput> = {}): InvitationInput {
  return {
    uid: "seat-42@sogverse",
    sequence: 0,
    method: "request",
    shape: "rule",
    weekdays: [0, 2, 4],
    startDate: "2026-09-07",
    endDate: "2026-10-02",
    startTime: "16:00",
    durationMinutes: 120,
    timezone: "Europe/Helsinki",
    summary: "Minecraft building camp – Aino",
    description: "Twelve afternoons of building.",
    location: "Kaisaniemenkatu 6, 00100 Helsinki",
    url: "https://sogverse.sog.gg/parent",
    organizer: { name: "School of Gaming", email: "sogverse@sog.gg" },
    attendee: { name: "Sanna", email: "sanna@example.com" },
    showAs: "free",
    reminderMinutes: [15],
    now: NOW,
    ...overrides,
  };
}

/** The document, or a thrown failure — every case here expects one to exist. */
function build(overrides: Partial<InvitationInput> = {}): {
  ics: string;
  occurrenceCount: number;
  truncated: boolean;
} {
  const result = buildInvitation(input(overrides));
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result;
}

/** Content lines, with folded continuations rejoined. */
function unfold(ics: string): string[] {
  const lines: string[] = [];
  for (const line of ics.split("\r\n")) {
    if (line.startsWith(" ") && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
      continue;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * The event's own lines.
 *
 * Load-bearing rather than tidiness: the `VTIMEZONE` block carries its own
 * `DTSTART` and `RRULE` lines describing the daylight-saving transitions, so a
 * search over the whole document finds those first and quietly asserts nothing
 * about the schedule.
 */
function eventBody(ics: string): string[] {
  const lines = unfold(ics);
  return lines.slice(lines.indexOf("BEGIN:VEVENT") + 1, lines.indexOf("END:VEVENT"));
}

function lineStartingWith(lines: string[] | string, prefix: string): string {
  const source = typeof lines === "string" ? unfold(lines) : lines;
  const found = source.find((line) => line.startsWith(prefix));
  if (found === undefined) throw new Error(`no line starting with ${prefix}`);
  return found;
}

function hasLine(lines: string[], prefix: string): boolean {
  return lines.some((line) => line.startsWith(prefix));
}

describe("one seat is one calendar object", () => {
  it("states the whole schedule in a single event under a single identifier", () => {
    const { ics, occurrenceCount } = build();

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics.match(/^UID:/gm)).toHaveLength(1);
    expect(lineStartingWith(ics, "UID:")).toBe("UID:seat-42@sogverse");
    expect(occurrenceCount).toBe(12);
  });

  it("terminates every line, the last one included", () => {
    const { ics } = build();
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("the weekly rule", () => {
  it("names the weekdays in RFC order however they arrive, and only once each", () => {
    const { ics } = build({ weekdays: [4, 0, 2, 0] });
    expect(lineStartingWith(eventBody(ics), "RRULE:")).toContain("BYDAY=MO,WE,FR");
  });

  /**
   * `UNTIL` is an instant, and it is the end of the last day *where the product
   * is* — the run ends when that day ends in Helsinki, not where the reader
   * happens to be. 2 October 2026 is inside summer time, so 23:59:59 local is
   * 20:59:59 UTC.
   */
  it("ends at the close of the last product-local day", () => {
    const { ics } = build();
    expect(lineStartingWith(eventBody(ics), "RRULE:")).toContain("UNTIL=20261002T205959Z");
  });

  /**
   * The one thing a rule can say and an explicit list cannot: a run with no
   * last day. A list stops at whatever horizon we happened to enumerate.
   */
  it("states no end at all for an open-ended run", () => {
    const { ics } = build({ endDate: null });
    expect(lineStartingWith(eventBody(ics), "RRULE:")).not.toContain("UNTIL");
  });

  it("starts at the first session still ahead and carries a duration, not an end", () => {
    const { ics } = build();
    expect(lineStartingWith(eventBody(ics), "DTSTART")).toBe(
      "DTSTART;TZID=Europe/Helsinki:20260907T160000",
    );
    expect(lineStartingWith(eventBody(ics), "DURATION:")).toBe("DURATION:PT120M");
    expect(ics).not.toContain("DTEND");
  });

  /** A session earlier today is over; the entry starts at the next one. */
  it("skips a session that has already started", () => {
    const { ics, occurrenceCount } = build({
      now: new Date("2026-09-07T15:00:00Z"),
    });
    expect(lineStartingWith(eventBody(ics), "DTSTART")).toContain("20260909T160000");
    expect(occurrenceCount).toBe(11);
  });
});

describe("the explicit list", () => {
  it("lists every session after the first, and never repeats the first", () => {
    const { ics } = build({ shape: "list" });
    const rdate = lineStartingWith(eventBody(ics), "RDATE");

    expect(rdate.startsWith("RDATE;TZID=Europe/Helsinki:")).toBe(true);
    const dates = rdate.slice("RDATE;TZID=Europe/Helsinki:".length).split(",");
    expect(dates).toHaveLength(11);
    expect(dates).not.toContain("20260907T160000");
    expect(new Set(dates).size).toBe(dates.length);
    expect(lineStartingWith(eventBody(ics), "DTSTART")).toContain("20260907T160000");
  });

  it("writes no rule at all", () => {
    const { ics } = build({ shape: "list" });
    expect(hasLine(eventBody(ics), "RRULE:")).toBe(false);
  });

  /**
   * Wall clocks, not instants: the list has to survive a daylight-saving
   * transition inside the run, and a weekly slot promises a clock face. The
   * last Sunday of October 2026 falls inside this run, and every session either
   * side of it still reads 16:00.
   */
  it("keeps the clock face across a daylight-saving transition", () => {
    const { ics } = build({
      shape: "list",
      startDate: "2026-10-19",
      endDate: "2026-11-02",
      weekdays: [0],
      now: new Date("2026-10-19T05:00:00Z"),
    });
    const rdate = lineStartingWith(eventBody(ics), "RDATE");
    expect(rdate).toContain("20261026T160000");
    expect(rdate).toContain("20261102T160000");
  });
});

describe("who is asking whom", () => {
  it("asks for an answer on a request", () => {
    const { ics } = build();
    expect(lineStartingWith(ics, "METHOD:")).toBe("METHOD:REQUEST");
    expect(lineStartingWith(eventBody(ics), "ORGANIZER")).toBe(
      'ORGANIZER;CN="School of Gaming":mailto:sogverse@sog.gg',
    );
    expect(lineStartingWith(eventBody(ics), "ATTENDEE")).toBe(
      'ATTENDEE;CN="Sanna";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:sanna@example.com',
    );
    expect(ics).toContain("STATUS:CONFIRMED");
  });

  it("asks nothing on a published entry, and names nobody to ask", () => {
    const { ics } = build({ method: "publish", attendee: null });
    expect(lineStartingWith(ics, "METHOD:")).toBe("METHOD:PUBLISH");
    expect(ics).toContain("ORGANIZER;CN=");
    expect(ics).not.toContain("ATTENDEE");
    expect(ics).toContain("STATUS:CONFIRMED");
  });

  /**
   * A withdrawal says so twice — at the calendar level so the message is read
   * as a retraction, and on the event so the entry a client already holds is
   * marked cancelled — and it names the attendee whose invitation is being
   * retracted without asking them anything.
   */
  it("withdraws the entry on a cancellation, without asking for a reply", () => {
    const { ics } = build({ method: "cancel", sequence: 2 });
    expect(lineStartingWith(ics, "METHOD:")).toBe("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SEQUENCE:2");
    expect(lineStartingWith(eventBody(ics), "ATTENDEE")).toBe(
      'ATTENDEE;CN="Sanna";ROLE=REQ-PARTICIPANT:mailto:sanna@example.com',
    );
    expect(ics).not.toContain("RSVP=TRUE");
  });
});

describe("the parts a client acts on", () => {
  /** Every `TRIGGER` in the document, in the order it is written. */
  function triggers(ics: string): string[] {
    return unfold(ics).filter((line) => line.startsWith("TRIGGER:"));
  }

  /**
   * Order is the property, not the set. Exchange keeps one alarm per item and
   * keeps the first, so a document whose alarms come back sorted — or reversed
   * — hands a Microsoft mailbox a different reminder than the one asked for.
   */
  it("writes two alarms in the order they were asked for", () => {
    expect(triggers(build({ reminderMinutes: [15, 1440] }).ics)).toEqual([
      "TRIGGER:-PT15M",
      "TRIGGER:-PT1440M",
    ]);
    expect(triggers(build({ reminderMinutes: [1440, 15] }).ics)).toEqual([
      "TRIGGER:-PT1440M",
      "TRIGGER:-PT15M",
    ]);
  });

  it("emits a single alarm, and none at all when none is asked for", () => {
    expect(triggers(build({ reminderMinutes: [60] }).ics)).toEqual(["TRIGGER:-PT60M"]);
    expect(build({ reminderMinutes: [] }).ics).not.toContain("BEGIN:VALARM");
  });

  /** Two alarms at one offset are one reminder everywhere, so one is written. */
  it("drops a repeated offset", () => {
    expect(triggers(build({ reminderMinutes: [15, 15] }).ics)).toEqual(["TRIGGER:-PT15M"]);
  });

  /**
   * Whether the entry blocks the reader's own time. A child's session normally
   * does not, and an iPhone reading a Microsoft 365 mailbox honours the answer,
   * so it is stated rather than left to the client.
   */
  it("says whether the entry blocks the reader's time", () => {
    expect(build({ showAs: "free" }).ics).toContain("TRANSP:TRANSPARENT");
    expect(build({ showAs: "busy" }).ics).toContain("TRANSP:OPAQUE");
  });

  it("files the entry under the brand and links back to the app", () => {
    const { ics } = build();
    expect(lineStartingWith(eventBody(ics), "CATEGORIES:")).toBe("CATEGORIES:School of Gaming");
    // A URI, not TEXT: escaping it would corrupt any query string it carries.
    expect(lineStartingWith(eventBody(ics), "URL:")).toBe("URL:https://sogverse.sog.gg/parent");
  });

  it("carries the HTML description only when one is given", () => {
    expect(build({ htmlDescription: "<p>Hello</p>" }).ics).toContain(
      "X-ALT-DESC;FMTTYPE=text/html:<p>Hello</p>",
    );
    expect(build().ics).not.toContain("X-ALT-DESC");
  });

  it("drops the location line for an online session", () => {
    expect(lineStartingWith(eventBody(build().ics), "LOCATION:")).toBe(
      // The comma is escaped: a `LOCATION` is a TEXT value, and an unescaped
      // comma there is read as the start of a second value.
      "LOCATION:Kaisaniemenkatu 6\\, 00100 Helsinki",
    );
    expect(hasLine(eventBody(build({ location: null }).ics), "LOCATION")).toBe(false);
  });
});

describe("the zone a document names", () => {
  it("ships the transition rules for the zone it can describe", () => {
    const { ics } = build();
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:Europe/Helsinki");
    expect(ics).not.toContain("X-SOGVERSE-NOTE");
  });

  /**
   * A `TZID` with no rules beside it is legal and every mainstream client
   * resolves it from its own database — but a document that says nothing about
   * the gap reads as one that has no gap.
   */
  it("says so when it cannot describe the zone it names", () => {
    const { ics } = build({ timezone: "Europe/Paris" });
    expect(ics).not.toContain("BEGIN:VTIMEZONE");
    expect(lineStartingWith(ics, "X-SOGVERSE-NOTE:")).toContain(
      "No VTIMEZONE is emitted for Europe/Paris",
    );
  });

  /**
   * UTC names no zone and needs none described: its times are absolute
   * instants, so there is no reference for a client to resolve and no gap to
   * warn anybody about. A `TZID=UTC` beside a `…Z` timestamp would be both
   * redundant and, on a strict reader, contradictory.
   */
  it("writes UTC as an absolute instant, with no zone named at all", () => {
    const { ics } = build({ timezone: "UTC" });
    expect(lineStartingWith(eventBody(ics), "DTSTART")).toBe("DTSTART:20260907T160000Z");
    expect(ics).not.toContain("TZID");
    expect(ics).not.toContain("BEGIN:VTIMEZONE");
    expect(ics).not.toContain("X-SOGVERSE-NOTE");
  });

  it("writes a UTC date list as absolute instants too", () => {
    const { ics } = build({ timezone: "UTC", shape: "list" });
    const rdate = lineStartingWith(eventBody(ics), "RDATE");

    expect(rdate.startsWith("RDATE:")).toBe(true);
    const dates = rdate.slice("RDATE:".length).split(",");
    expect(dates).toHaveLength(11);
    for (const date of dates) expect(date).toMatch(/^\d{8}T160000Z$/);
  });
});

/**
 * Whether the document stops short of the run it describes.
 *
 * Only the explicit list can: it enumerates and therefore has to stop, while a
 * rule states an open-ended run in one line. The mail's own sentence turns on
 * this — an entry that holds twelve weeks must not claim to hold every session
 * still ahead.
 */
describe("the twelve-week horizon", () => {
  it("is not reached by a run that ends inside it", () => {
    expect(build({ shape: "list" }).truncated).toBe(false);
    expect(build({ shape: "rule" }).truncated).toBe(false);
  });

  it("cuts an open-ended list, and never a rule", () => {
    expect(build({ shape: "list", endDate: null }).truncated).toBe(true);
    expect(build({ shape: "rule", endDate: null }).truncated).toBe(false);
  });

  it("cuts a list whose end date is past the horizon", () => {
    expect(build({ shape: "list", endDate: "2027-06-01" }).truncated).toBe(true);
    expect(build({ shape: "rule", endDate: "2027-06-01" }).truncated).toBe(false);
  });
});

describe("the parts every naive writer gets wrong", () => {
  it("escapes the characters RFC 5545 reserves in a TEXT value", () => {
    const { ics } = build({
      summary: "Camp; building, and more\\stuff",
      description: "First line\nSecond line",
    });
    expect(lineStartingWith(eventBody(ics), "SUMMARY:")).toBe(
      "SUMMARY:Camp\\; building\\, and more\\\\stuff",
    );
    expect(lineStartingWith(eventBody(ics), "DESCRIPTION:")).toBe(
      "DESCRIPTION:First line\\nSecond line",
    );
  });

  /**
   * Every name is quoted, whether or not RFC 5545 forces it. A bare
   * `CN=School of Gaming` was displayed as "School Gaming" by an iPhone reading
   * a Microsoft 365 mailbox, so the quotes are what stop a client guessing
   * where the value ends. A quoted string cannot contain a double quote at all
   * — there is no escape for one — so a quote inside a name is dropped rather
   * than smuggled through.
   */
  it("quotes every name, and drops a quote inside one outright", () => {
    expect(lineStartingWith(eventBody(build().ics), "ORGANIZER")).toContain(
      'CN="School of Gaming"',
    );
    expect(
      lineStartingWith(eventBody(build({ attendee: { name: "Virtanen, Sanna", email: "s@example.com" } }).ics), "ATTENDEE"),
    ).toContain('CN="Virtanen, Sanna"');
    expect(
      lineStartingWith(eventBody(build({ attendee: { name: 'Sanna "Ace"', email: "s@example.com" } }).ics), "ATTENDEE"),
    ).toContain('CN="Sanna Ace"');
  });

  /**
   * Folding is counted in **octets**, not characters, and the difference is not
   * academic: a Finnish or Swedish product name is full of two-byte letters, so
   * a fold counted in characters emits lines a strict parser rejects. The walk
   * is by code point, so no multi-byte sequence is ever split down the middle —
   * which is what re-decoding the whole document proves.
   */
  it("folds long lines by octet without splitting a character", () => {
    const summary = "Ääriödyllinen Minecraft-rakennusleiri Kaisaniemessä — pitkä otsikko ylittää rivin";
    const { ics } = build({ summary });
    const encoder = new TextEncoder();

    for (const line of ics.split("\r\n")) {
      expect(encoder.encode(line).length, `too long: ${line}`).toBeLessThanOrEqual(75);
    }
    expect(ics).toContain("\r\n ");
    expect(lineStartingWith(eventBody(ics), "SUMMARY:")).toBe(`SUMMARY:${summary}`);
  });
});

describe("a run with nothing left in it", () => {
  /**
   * A refusal rather than an empty document: an empty calendar says nothing to
   * a client, and sending one would still open a conversation the recipient's
   * calendar has no entry for. The caller is the one that knows what to say
   * about it.
   */
  it("is refused rather than serialised", () => {
    expect(buildInvitation(input({ startDate: "2020-01-06", endDate: "2020-02-03" }))).toEqual({
      ok: false,
      reason: "no-occurrences",
    });
  });

  it("is refused when the schedule names no weekday at all", () => {
    expect(buildInvitation(input({ weekdays: [] }))).toEqual({
      ok: false,
      reason: "no-occurrences",
    });
  });
});
