import { describe, it, expect } from "vitest";
import {
  buildInvitation,
  type InvitationInput,
} from "@/lib/calendar-invitations/invitation";

/**
 * The calendar document, asserted on the bytes that leave the building.
 *
 * A client is handed a string and nothing else, so what is wrong with an
 * invitation is a property of that string: a `BYDAY` in the wrong order, an
 * unescaped semicolon, a `VTIMEZONE` with the wrong offset in it, a
 * `RECURRENCE-ID` naming a moment the rule never produced. None of those are
 * visible from the input, and every one of them is a real client's silently
 * wrong entry.
 *
 * **The builder is an explorer, so what is pinned is presence and absence.**
 * Every field either writes its property or writes nothing, and both halves
 * matter equally: the whole method is to send a baseline, change one field and
 * compare, which only works if changing nothing changes nothing.
 *
 * **The clock is fixed**, because `DTSTAMP` is read off `now` and a test that
 * read the wall clock would print a different document every run.
 */

/** Monday 7 September 2026, 08:00 in Helsinki. */
const NOW = new Date("2026-09-07T05:00:00Z");

/**
 * The baseline: a single two-hour occurrence next Monday, in Helsinki, with
 * every optional property left out. Each case below turns exactly one knob.
 */
function input(overrides: Partial<InvitationInput> = {}): InvitationInput {
  return {
    uid: "explorer-1@sogverse",
    sequence: 0,
    method: "request",
    status: "confirmed",
    timezone: "Europe/Helsinki",
    timeForm: "tzid",
    allDay: false,
    start: { date: "2026-09-07", time: "16:00" },
    durationMinutes: 120,
    recurrence: { kind: "none" },
    excludedDates: [],
    overrides: [],
    organizer: { name: "School of Gaming", email: "sogverse@sog.gg" },
    attendee: {
      name: "Sanna",
      email: "sanna@example.com",
      role: "REQ-PARTICIPANT",
      partstat: "NEEDS-ACTION",
      rsvp: true,
    },
    summary: "Calendar invite explorer",
    description: "",
    location: "",
    url: "",
    alarms: [],
    alarmEmail: "sanna@example.com",
    showAs: "free",
    now: NOW,
    ...overrides,
  };
}

/** The document, or a thrown failure — every case here expects one to exist. */
function build(overrides: Partial<InvitationInput> = {}): { ics: string } {
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
 * One `VEVENT`'s own lines, by position: `0` is the master and the overrides
 * follow it in the order they were given.
 *
 * Load-bearing rather than tidiness. A `VTIMEZONE` block carries `DTSTART` and
 * `RRULE` lines of its own describing the daylight-saving transitions, so a
 * search over the whole document finds those first and quietly asserts nothing
 * about the schedule — and once a document can hold several components, a
 * search that is merely inside "the event" finds the master's answer to a
 * question about an override.
 */
function eventBody(ics: string, index = 0): string[] {
  const lines = unfold(ics);
  const bodies: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = [];
      continue;
    }
    if (line === "END:VEVENT") {
      if (current !== null) bodies.push(current);
      current = null;
      continue;
    }
    current?.push(line);
  }
  if (index >= bodies.length) throw new Error(`no VEVENT at index ${index}`);
  return bodies[index];
}

/** The `VTIMEZONE` block, or an empty list when the document writes none. */
function zoneBody(ics: string): string[] {
  const lines = unfold(ics);
  const start = lines.indexOf("BEGIN:VTIMEZONE");
  if (start === -1) return [];
  return lines.slice(start, lines.indexOf("END:VTIMEZONE") + 1);
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

describe("the baseline document", () => {
  it("states one event under one identifier, and terminates every line", () => {
    const { ics } = build();

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics.match(/^UID:/gm)).toHaveLength(1);
    expect(lineStartingWith(ics, "UID:")).toBe("UID:explorer-1@sogverse");
    expect(lineStartingWith(ics, "DTSTAMP:")).toBe("DTSTAMP:20260907T050000Z");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("writes the wall clock under a TZID, with a duration rather than an end", () => {
    const body = eventBody(build().ics);
    expect(lineStartingWith(body, "DTSTART")).toBe(
      "DTSTART;TZID=Europe/Helsinki:20260907T160000",
    );
    expect(lineStartingWith(body, "DURATION:")).toBe("DURATION:PT120M");
    expect(hasLine(body, "DTEND")).toBe(false);
  });

  /**
   * The other half of every case below. An explorer is only usable if the
   * baseline is quiet: a client that renders it and then mangles the next send
   * has told you which property it mangled, and that inference only holds if
   * nothing was written that nobody asked for.
   */
  it("writes nothing nobody asked for", () => {
    const body = eventBody(build().ics);
    for (const property of [
      "DESCRIPTION",
      "LOCATION",
      "URL",
      "RRULE",
      "EXDATE",
      "RECURRENCE-ID",
      "BEGIN:VALARM",
    ]) {
      expect(hasLine(body, property), `${property} was written unasked`).toBe(false);
    }
  });

  it("always states the status and the transparency", () => {
    const body = eventBody(build().ics);
    expect(body).toContain("STATUS:CONFIRMED");
    expect(body).toContain("TRANSP:TRANSPARENT");
  });
});

describe("the zone a document names", () => {
  /**
   * One block per zone, offsets and transition rules alike.
   *
   * Four of the five follow the one European rule seen from four offsets — the
   * switch is at 01:00 UTC, so its local clock face differs per zone — and the
   * fifth is the genuinely different American one. Getting an offset or a
   * `BYDAY` wrong here moves every occurrence in the document by an hour, on
   * exactly the clients that read the block instead of their own database,
   * which is the failure no amount of eyeballing the document catches.
   */
  const ZONES = [
    {
      zone: "Europe/Helsinki",
      daylight: ["TZOFFSETFROM:+0200", "TZOFFSETTO:+0300", "TZNAME:EEST", "DTSTART:19700329T030000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU"],
      standard: ["TZOFFSETFROM:+0300", "TZOFFSETTO:+0200", "TZNAME:EET", "DTSTART:19701025T040000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU"],
    },
    {
      zone: "Europe/Stockholm",
      daylight: ["TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU"],
      standard: ["TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU"],
    },
    {
      zone: "Europe/Paris",
      daylight: ["TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU"],
      standard: ["TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU"],
    },
    {
      zone: "Europe/London",
      daylight: ["TZOFFSETFROM:+0000", "TZOFFSETTO:+0100", "TZNAME:BST", "DTSTART:19700329T010000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU"],
      standard: ["TZOFFSETFROM:+0100", "TZOFFSETTO:+0000", "TZNAME:GMT", "DTSTART:19701025T020000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU"],
    },
    {
      zone: "America/New_York",
      daylight: ["TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "TZNAME:EDT", "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU"],
      standard: ["TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "TZNAME:EST", "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU"],
    },
  ];

  it.each(ZONES)("ships the transition rules for $zone", ({ zone, daylight, standard }) => {
    const { ics } = build({ timezone: zone });

    expect(zoneBody(ics)).toEqual([
      "BEGIN:VTIMEZONE",
      `TZID:${zone}`,
      `X-LIC-LOCATION:${zone}`,
      "BEGIN:DAYLIGHT",
      ...daylight,
      "END:DAYLIGHT",
      "BEGIN:STANDARD",
      ...standard,
      "END:STANDARD",
      "END:VTIMEZONE",
    ]);
    expect(lineStartingWith(eventBody(ics), "DTSTART")).toBe(
      `DTSTART;TZID=${zone}:20260907T160000`,
    );
  });

  /**
   * UTC names no zone and needs none described: its times are absolute
   * instants, so there is no reference for a client to resolve and no gap to
   * warn anybody about. A `TZID=UTC` beside a `…Z` timestamp would be both
   * redundant and, on a strict reader, contradictory — so UTC takes the
   * instant form whatever the caller asked for.
   */
  it("writes UTC as an absolute instant, with no zone named at all", () => {
    const { ics } = build({ timezone: "UTC" });
    expect(lineStartingWith(eventBody(ics), "DTSTART")).toBe("DTSTART:20260907T160000Z");
    expect(ics).not.toContain("TZID");
    expect(ics).not.toContain("BEGIN:VTIMEZONE");
    expect(ics).not.toContain("X-SOGVERSE-NOTE");
  });

  /**
   * The instant form converts, which is the whole difference between the two:
   * 16:00 in Helsinki on a September day is 13:00 UTC, and a client shown the
   * instant has no clock face to keep across a daylight-saving transition.
   */
  it("converts a wall clock to an instant when the instant form is asked for", () => {
    const { ics } = build({ timeForm: "utc" });
    expect(lineStartingWith(eventBody(ics), "DTSTART")).toBe("DTSTART:20260907T130000Z");
    expect(ics).not.toContain("BEGIN:VTIMEZONE");
  });

  /**
   * A `TZID` with no rules beside it is legal and every mainstream client
   * resolves it from its own database — but a document that says nothing about
   * the gap reads as one that has no gap, and the reader comparing clients is
   * exactly the person who needs to know which case they are looking at.
   */
  it("says so when it cannot describe the zone it names", () => {
    const { ics } = build({ timezone: "Pacific/Auckland" });
    expect(ics).not.toContain("BEGIN:VTIMEZONE");
    expect(lineStartingWith(ics, "X-SOGVERSE-NOTE:")).toContain(
      "No VTIMEZONE is emitted for Pacific/Auckland",
    );
  });
});

describe("an all-day event", () => {
  /**
   * A DATE value carries no clock face and takes no zone, and its end is the
   * day *after* the last one — which is what every client reads a DATE-valued
   * `DTEND` as. A duration is not written at all: two ways of saying when it
   * ends is one way too many.
   */
  it("writes DATE values, an exclusive end, and no zone at all", () => {
    const { ics } = build({ allDay: true });
    const body = eventBody(ics);

    expect(lineStartingWith(body, "DTSTART")).toBe("DTSTART;VALUE=DATE:20260907");
    expect(lineStartingWith(body, "DTEND")).toBe("DTEND;VALUE=DATE:20260908");
    expect(hasLine(body, "DURATION")).toBe(false);
    expect(ics).not.toContain("TZID");
    expect(ics).not.toContain("BEGIN:VTIMEZONE");
  });

  it("ends a month on the first of the next one", () => {
    const { ics } = build({ allDay: true, start: { date: "2026-09-30", time: "16:00" } });
    expect(lineStartingWith(eventBody(ics), "DTEND")).toBe("DTEND;VALUE=DATE:20261001");
  });

  /**
   * A DATE value has no clock face for minutes to land on, so the duration is
   * read in the only unit it has. Three days is `DTEND` on the fourth, which is
   * the same exclusive end one day already had — and anything short of a whole
   * day still buys a whole one, because a DATE-valued block that ended before
   * it started is not something a client can read.
   */
  it("reads the duration in whole days, and rounds a part of one up", () => {
    const threeDays = build({ allDay: true, durationMinutes: 3 * 24 * 60 });
    expect(lineStartingWith(eventBody(threeDays.ics), "DTSTART")).toBe(
      "DTSTART;VALUE=DATE:20260907",
    );
    expect(lineStartingWith(eventBody(threeDays.ics), "DTEND")).toBe("DTEND;VALUE=DATE:20260910");

    const oneMinuteOver = build({ allDay: true, durationMinutes: 24 * 60 + 1 });
    expect(lineStartingWith(eventBody(oneMinuteOver.ics), "DTEND")).toBe(
      "DTEND;VALUE=DATE:20260909",
    );
  });

  it("writes a DATE-valued UNTIL, which is what a DATE-valued start forces", () => {
    const { ics } = build({
      allDay: true,
      recurrence: { kind: "weekly", weekdays: [0], interval: 1, until: "2026-10-05", count: null },
    });
    expect(lineStartingWith(eventBody(ics), "RRULE:")).toBe(
      "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261005",
    );
  });
});

describe("the weekly rule", () => {
  function weekly(overrides: Partial<Extract<InvitationInput["recurrence"], { kind: "weekly" }>> = {}) {
    return build({
      recurrence: {
        kind: "weekly",
        weekdays: [0, 2, 4],
        interval: 1,
        until: null,
        count: null,
        ...overrides,
      },
    });
  }

  it("names the weekdays in RFC order however they arrive, and only once each", () => {
    const { ics } = weekly({ weekdays: [4, 0, 2, 0] });
    expect(lineStartingWith(eventBody(ics), "RRULE:")).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR");
  });

  /** The one thing a rule can say and an enumeration cannot: a run with no last day. */
  it("states no end at all for an open-ended rule", () => {
    const { ics } = weekly();
    expect(lineStartingWith(eventBody(ics), "RRULE:")).not.toContain("UNTIL");
    expect(lineStartingWith(eventBody(ics), "RRULE:")).not.toContain("COUNT");
  });

  /**
   * `UNTIL` on a `TZID`-qualified start has to be a UTC instant — RFC 5545 is
   * strict about it and so are clients — and it is the end of the last day
   * *where the event is*: 2 October 2026 is inside summer time, so 23:59:59 in
   * Helsinki is 20:59:59 UTC.
   */
  it("ends at the close of the last local day, expressed in UTC", () => {
    const { ics } = weekly({ until: "2026-10-02" });
    expect(lineStartingWith(eventBody(ics), "RRULE:")).toBe(
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261002T205959Z",
    );
  });

  /** RFC 5545 forbids stating both, so the count is the one that wins. */
  it("writes COUNT instead of UNTIL when both are given", () => {
    const { ics } = weekly({ until: "2026-10-02", count: 8 });
    expect(lineStartingWith(eventBody(ics), "RRULE:")).toBe(
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=8",
    );
  });

  it("writes an interval only when it is not the default of one", () => {
    expect(lineStartingWith(eventBody(weekly({ interval: 2, until: "2026-10-02" }).ics), "RRULE:"))
      .toBe("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=2;UNTIL=20261002T205959Z");
    expect(lineStartingWith(eventBody(weekly().ics), "RRULE:")).not.toContain("INTERVAL");
  });
});

describe("excluded dates", () => {
  const weekly = {
    kind: "weekly",
    weekdays: [0, 2, 4],
    interval: 1,
    until: "2026-10-02",
    count: null,
  } satisfies InvitationInput["recurrence"];

  it("writes one EXDATE at the start's own clock face", () => {
    const { ics } = build({
      recurrence: weekly,
      excludedDates: ["2026-09-09", "2026-09-16"],
    });
    expect(lineStartingWith(eventBody(ics), "EXDATE")).toBe(
      "EXDATE;TZID=Europe/Helsinki:20260909T160000,20260916T160000",
    );
  });

  it("writes an all-day exclusion as a bare date", () => {
    const { ics } = build({ allDay: true, excludedDates: ["2026-09-14"] });
    expect(lineStartingWith(eventBody(ics), "EXDATE")).toBe("EXDATE;VALUE=DATE:20260914");
  });
});

/**
 * The mechanism a mixed-time product needs, and the one a single moved session
 * needs, which turn out to be the same mechanism.
 *
 * A rule states one clock face, so a club meeting Monday at 16:00 and Wednesday
 * at 14:00 cannot be one `RRULE`, and neither can a term whose one week shifted
 * an hour. RFC 5545 answers both with an extra `VEVENT` under the same `UID`,
 * naming the occurrence it replaces — and the property that has to be exactly
 * right is the `RECURRENCE-ID`, because it names the occurrence *as the rule
 * produced it*. Write the new time there and a client creates a second entry
 * beside the one that was meant to move.
 */
describe("an overridden occurrence", () => {
  const weekly = {
    kind: "weekly",
    weekdays: [0, 2],
    interval: 1,
    until: "2026-10-02",
    count: null,
  } satisfies InvitationInput["recurrence"];

  function overridden(overrides: Partial<InvitationInput> = {}) {
    return build({
      recurrence: weekly,
      overrides: [{ date: "2026-09-09", time: "14:00", durationMinutes: 90 }],
      ...overrides,
    });
  }

  it("adds a second VEVENT under the same identifier", () => {
    const { ics } = overridden();
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(new Set(unfold(ics).filter((line) => line.startsWith("UID:")))).toEqual(
      new Set(["UID:explorer-1@sogverse"]),
    );
  });

  it("names the occurrence at the rule's own clock face, and moves it", () => {
    const body = eventBody(overridden().ics, 1);
    expect(lineStartingWith(body, "RECURRENCE-ID")).toBe(
      "RECURRENCE-ID;TZID=Europe/Helsinki:20260909T160000",
    );
    expect(lineStartingWith(body, "DTSTART")).toBe(
      "DTSTART;TZID=Europe/Helsinki:20260909T140000",
    );
    expect(lineStartingWith(body, "DURATION:")).toBe("DURATION:PT90M");
  });

  it("keeps the master's duration when the line states none", () => {
    const { ics } = overridden({
      overrides: [{ date: "2026-09-09", time: "14:00", durationMinutes: null }],
    });
    expect(lineStartingWith(eventBody(ics, 1), "DURATION:")).toBe("DURATION:PT120M");
  });

  /**
   * An override differs from the rest in *when it happens*, and in nothing
   * else. A client comparing the two components should find one difference; a
   * summary or an attendee that drifted between them would show up as an
   * occurrence that mysteriously lost its RSVP.
   */
  it("copies every property that is not the schedule", () => {
    const { ics } = overridden({
      summary: "Weekly club",
      description: "What we do.",
      location: "Helsinki",
      url: "https://sogverse.sog.gg/parent",
      alarms: [{ minutesBefore: 15, action: "display", anchor: "start" }],
    });
    const master = eventBody(ics, 0);
    const exception = eventBody(ics, 1);
    const shared = (body: string[]) =>
      body.filter(
        (line) =>
          !line.startsWith("DTSTART") &&
          !line.startsWith("DURATION") &&
          !line.startsWith("RRULE") &&
          !line.startsWith("RECURRENCE-ID"),
      );

    expect(shared(exception)).toEqual(shared(master));
    expect(shared(exception)).toContain("SUMMARY:Weekly club");
    expect(shared(exception)).toContain("STATUS:CONFIRMED");
    expect(shared(exception)).toContain("TRANSP:TRANSPARENT");
    expect(shared(exception)).toContain("TRIGGER:-PT15M");
    expect(lineStartingWith(exception, "ATTENDEE")).toContain("RSVP=TRUE");
    expect(lineStartingWith(exception, "ORGANIZER")).toContain("sogverse@sog.gg");
    expect(lineStartingWith(exception, "URL:")).toBe("URL:https://sogverse.sog.gg/parent");
  });

  it("writes one component per line, in the order they were given", () => {
    const { ics } = overridden({
      overrides: [
        { date: "2026-09-09", time: "14:00", durationMinutes: null },
        { date: "2026-09-14", time: "17:00", durationMinutes: null },
      ],
    });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(lineStartingWith(eventBody(ics, 1), "RECURRENCE-ID")).toContain("20260909T160000");
    expect(lineStartingWith(eventBody(ics, 2), "RECURRENCE-ID")).toContain("20260914T160000");
  });

  /** The `RECURRENCE-ID` takes the document's own time form, whichever it is. */
  it("states the recurrence id in the instant form when the document does", () => {
    const { ics } = overridden({ timeForm: "utc" });
    expect(lineStartingWith(eventBody(ics, 1), "RECURRENCE-ID")).toBe(
      "RECURRENCE-ID:20260909T130000Z",
    );
  });

  it("states it as a bare date on an all-day document", () => {
    const { ics } = overridden({ allDay: true });
    const body = eventBody(ics, 1);
    expect(lineStartingWith(body, "RECURRENCE-ID")).toBe("RECURRENCE-ID;VALUE=DATE:20260909");
    expect(lineStartingWith(body, "DTEND")).toBe("DTEND;VALUE=DATE:20260910");
  });

  /** A single event has no occurrences, so there is nothing to except. */
  it("is dropped when the schedule is a single event", () => {
    const { ics } = build({
      recurrence: { kind: "none" },
      overrides: [{ date: "2026-09-09", time: "14:00", durationMinutes: null }],
    });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).not.toContain("RECURRENCE-ID");
  });

  /**
   * An exception replaces an occurrence, it does not add one — so the rule the
   * master states is the same rule with an override on the document as without,
   * and the extra component is the only difference between the two.
   */
  it("leaves the rule alone", () => {
    expect(lineStartingWith(eventBody(overridden().ics), "RRULE:")).toBe(
      lineStartingWith(eventBody(build({ recurrence: weekly }).ics), "RRULE:"),
    );
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
  });

  it("writes every attendee parameter the caller chose", () => {
    const { ics } = build({
      attendee: {
        name: "Sanna",
        email: "sanna@example.com",
        role: "OPT-PARTICIPANT",
        partstat: "ACCEPTED",
        rsvp: false,
      },
    });
    expect(lineStartingWith(eventBody(ics), "ATTENDEE")).toBe(
      'ATTENDEE;CN="Sanna";ROLE=OPT-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:sanna@example.com',
    );
  });

  it("names nobody at all when no attendee is given, as a publish normally does", () => {
    const { ics } = build({ method: "publish", attendee: null });
    expect(lineStartingWith(ics, "METHOD:")).toBe("METHOD:PUBLISH");
    expect(ics).toContain("ORGANIZER;CN=");
    expect(ics).not.toContain("ATTENDEE");
  });

  /**
   * A withdrawal normally says so twice — at the calendar level so the message
   * is read as a retraction, and on the event so the entry a client already
   * holds is marked cancelled — but the two are separate fields here, because
   * whether a client needs both is one of the things worth finding out.
   */
  it("withdraws the entry when both the method and the status say so", () => {
    const { ics } = build({ method: "cancel", status: "cancelled", sequence: 2 });
    expect(lineStartingWith(ics, "METHOD:")).toBe("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SEQUENCE:2");
  });

  it("writes a tentative status on its own", () => {
    expect(build({ status: "tentative" }).ics).toContain("STATUS:TENTATIVE");
  });
});

describe("the content properties", () => {
  it("writes a description only when one is given", () => {
    expect(
      lineStartingWith(eventBody(build({ description: "Two lines\nof it." }).ics), "DESCRIPTION:"),
    ).toBe("DESCRIPTION:Two lines\\nof it.");
    expect(hasLine(eventBody(build().ics), "DESCRIPTION")).toBe(false);
  });

  it("escapes a location and drops the line when there is none", () => {
    expect(
      lineStartingWith(eventBody(build({ location: "Kaisaniemenkatu 6, Helsinki" }).ics), "LOCATION:"),
      // A `LOCATION` is a TEXT value, and an unescaped comma there is read as
      // the start of a second value.
    ).toBe("LOCATION:Kaisaniemenkatu 6\\, Helsinki");
    expect(hasLine(eventBody(build().ics), "LOCATION")).toBe(false);
  });

  it("writes a URL unescaped, query string and all", () => {
    expect(
      lineStartingWith(eventBody(build({ url: "https://sogverse.sog.gg/parent?a=1&b=2" }).ics), "URL:"),
    ).toBe("URL:https://sogverse.sog.gg/parent?a=1&b=2");
    expect(hasLine(eventBody(build().ics), "URL")).toBe(false);
  });

  it("says whether the entry blocks the reader's time", () => {
    expect(build({ showAs: "free" }).ics).toContain("TRANSP:TRANSPARENT");
    expect(build({ showAs: "busy" }).ics).toContain("TRANSP:OPAQUE");
  });
});

describe("the alarms", () => {
  /** Every `TRIGGER` in the document, in the order it is written. */
  function triggers(ics: string): string[] {
    return unfold(ics).filter((line) => line.startsWith("TRIGGER"));
  }

  /**
   * Order is a real property, not tidiness. Exchange keeps one alarm per item
   * and keeps the first, so a document whose alarms came back sorted would hand
   * a Microsoft mailbox a different reminder than the one asked for.
   */
  it("writes three alarms in the order they were asked for", () => {
    const { ics } = build({
      alarms: [
        { minutesBefore: 15, action: "display", anchor: "start" },
        { minutesBefore: 1440, action: "display", anchor: "start" },
        { minutesBefore: 0, action: "audio", anchor: "start" },
      ],
    });
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(3);
    expect(triggers(ics)).toEqual(["TRIGGER:-PT15M", "TRIGGER:-PT1440M", "TRIGGER:-PT0M"]);
  });

  it("anchors an alarm to the end of the event when asked to", () => {
    expect(
      triggers(build({ alarms: [{ minutesBefore: 5, action: "display", anchor: "end" }] }).ics),
    ).toEqual(["TRIGGER;RELATED=END:-PT5M"]);
  });

  /** A display alarm needs something to show; an audio one needs nothing. */
  it("gives a display alarm its description and an audio alarm nothing else", () => {
    const display = unfold(
      build({ alarms: [{ minutesBefore: 15, action: "display", anchor: "start" }] }).ics,
    );
    expect(display.slice(display.indexOf("BEGIN:VALARM"), display.indexOf("END:VALARM") + 1)).toEqual([
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT15M",
      "DESCRIPTION:Calendar invite explorer",
      "END:VALARM",
    ]);

    const audio = unfold(
      build({ alarms: [{ minutesBefore: 15, action: "audio", anchor: "start" }] }).ics,
    );
    expect(audio.slice(audio.indexOf("BEGIN:VALARM"), audio.indexOf("END:VALARM") + 1)).toEqual([
      "BEGIN:VALARM",
      "ACTION:AUDIO",
      "TRIGGER:-PT15M",
      "END:VALARM",
    ]);
  });

  /** An email alarm is invalid without a subject and somebody to send it to. */
  it("gives an email alarm a summary and an attendee", () => {
    const lines = unfold(
      build({ alarms: [{ minutesBefore: 60, action: "email", anchor: "start" }] }).ics,
    );
    expect(lines.slice(lines.indexOf("BEGIN:VALARM"), lines.indexOf("END:VALARM") + 1)).toEqual([
      "BEGIN:VALARM",
      "ACTION:EMAIL",
      "TRIGGER:-PT60M",
      "DESCRIPTION:Calendar invite explorer",
      "SUMMARY:Calendar invite explorer",
      "ATTENDEE:mailto:sanna@example.com",
      "END:VALARM",
    ]);
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
    const attendee = (name: string) =>
      lineStartingWith(
        eventBody(
          build({
            attendee: {
              name,
              email: "s@example.com",
              role: "REQ-PARTICIPANT",
              partstat: "NEEDS-ACTION",
              rsvp: true,
            },
          }).ics,
        ),
        "ATTENDEE",
      );
    expect(attendee("Virtanen, Sanna")).toContain('CN="Virtanen, Sanna"');
    expect(attendee('Sanna "Ace"')).toContain('CN="Sanna Ace"');
  });

  /**
   * Folding is counted in **octets**, not characters, and the difference is not
   * academic: a Finnish or Swedish name is full of two-byte letters, so a fold
   * counted in characters emits lines a strict parser rejects. The walk is by
   * code point, so no multi-byte sequence is ever split down the middle — which
   * is what re-decoding the whole document proves.
   */
  it("folds long lines by octet without splitting a character", () => {
    const summary =
      "Ääriödyllinen Minecraft-rakennusleiri Kaisaniemessä — pitkä otsikko ylittää rivin";
    const { ics } = build({ summary });
    const encoder = new TextEncoder();

    for (const line of ics.split("\r\n")) {
      expect(encoder.encode(line).length, `too long: ${line}`).toBeLessThanOrEqual(75);
    }
    expect(ics).toContain("\r\n ");
    expect(lineStartingWith(eventBody(ics), "SUMMARY:")).toBe(`SUMMARY:${summary}`);
  });
});

describe("an object with nothing in it", () => {
  /**
   * A refusal rather than an empty document: a calendar describing no
   * occurrence says nothing to a client, and sending one would still open a
   * conversation the recipient's calendar has no entry for. The caller is the
   * one that knows what to say about it.
   */
  it("is refused when the only occurrence is excluded", () => {
    expect(buildInvitation(input({ excludedDates: ["2026-09-07"] }))).toEqual({
      ok: false,
      reason: "no-occurrences",
    });
  });

  /**
   * `DTSTART` is an instance whether or not it satisfies the rule beside it —
   * RFC 5545 makes it the first one — so a document whose every *rule* day is
   * excluded still states the start and is not refused. That is what gives the
   * refusal exactly one meaning, which is what its message claims.
   */
  it("counts the start even on a weekday the rule never produces", () => {
    const tuesdays = {
      kind: "weekly",
      weekdays: [1],
      interval: 1,
      until: "2026-09-15",
      count: null,
    } satisfies InvitationInput["recurrence"];

    // The start is Monday 7 September, on a rule that produces only Tuesdays.
    expect(
      buildInvitation(
        input({ recurrence: tuesdays, excludedDates: ["2026-09-08", "2026-09-15"] }),
      ).ok,
    ).toBe(true);
    expect(
      buildInvitation(
        input({
          recurrence: tuesdays,
          excludedDates: ["2026-09-07", "2026-09-08", "2026-09-15"],
        }),
      ),
    ).toEqual({ ok: false, reason: "no-occurrences" });
  });

  it("is refused when every occurrence of the rule is excluded", () => {
    expect(
      buildInvitation(
        input({
          recurrence: {
            kind: "weekly",
            weekdays: [0],
            interval: 1,
            until: "2026-09-14",
            count: null,
          },
          excludedDates: ["2026-09-07", "2026-09-14"],
        }),
      ),
    ).toEqual({ ok: false, reason: "no-occurrences" });
  });
});
