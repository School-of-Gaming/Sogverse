import { describe, expect, it } from "vitest";
import type { FeedSeat } from "@/lib/calendar-feed/events";
import { getCalendarFeedTranslator } from "@/lib/calendar-feed/translator";
import {
  buildInvitationCalendar,
  type InvitationCalendar,
} from "@/lib/calendar-invitations/invitation";
import type {
  InvitationMethod,
  InvitationReminder,
  InvitationShape,
} from "@/lib/calendar-invitations/options";

/**
 * One seat rendered as an iTIP message.
 *
 * What is worth pinning here is not the serialisation — the shared writer's own
 * tests already cover folding, escaping and both timestamp forms — but the four
 * properties that make this a *message* rather than a document: that it
 * describes exactly one calendar object, who is asking whom, which revision it
 * is, and whether the client is being told to add an event or remove one.
 */

const GAMER = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const SEAT = "cccccccc-3333-4333-8333-cccccccccccc";

/** A Monday, mid-morning, well inside the club's run. */
const NOW = new Date("2026-03-02T09:00:00Z");

function seat(overrides: Partial<FeedSeat> = {}): FeedSeat {
  return {
    participationId: SEAT,
    participantId: GAMER,
    gamerName: "Aino",
    isPlaced: true,
    productType: "consumer_club",
    productName: "Monday club",
    timezone: "Europe/Helsinki",
    startDate: null,
    endDate: null,
    isRemote: true,
    locationName: null,
    spokenLanguageCode: "en",
    slots: [{ weekday: 0, startTime: "16:30", durationMinutes: 90 }],
    cancelsAt: null,
    ...overrides,
  };
}

/** Tuesday and Thursday at the same clock face — a rule can state this. */
const TWO_SLOT_CLUB: FeedSeat = seat({
  productName: "Tuesday and Thursday club",
  slots: [
    { weekday: 1, startTime: "16:30", durationMinutes: 90 },
    { weekday: 3, startTime: "16:30", durationMinutes: 90 },
  ],
});

/** Two weekdays at different times of day — no single rule says this. */
const DIFFERENT_TIMES: FeedSeat = seat({
  slots: [
    { weekday: 1, startTime: "16:30", durationMinutes: 90 },
    { weekday: 3, startTime: "17:30", durationMinutes: 90 },
  ],
});

/** Same clock face, different lengths — no single rule, and no single duration. */
const DIFFERENT_LENGTHS: FeedSeat = seat({
  slots: [
    { weekday: 1, startTime: "16:30", durationMinutes: 90 },
    { weekday: 3, startTime: "16:30", durationMinutes: 120 },
  ],
});

interface BuildOverrides {
  seat?: FeedSeat;
  baseUid?: string;
  sequence?: number;
  method?: InvitationMethod;
  shape?: InvitationShape;
  reminder?: InvitationReminder;
  attendeeName?: string;
}

async function build(overrides: BuildOverrides = {}): Promise<string> {
  return (await buildCalendar(overrides)).ics;
}

/**
 * The built calendar, for the cases that expect one.
 *
 * A refusal reaching here is a test asserting on a document that was never
 * produced, so it fails loudly rather than reading properties off `undefined`.
 */
async function buildCalendar(
  overrides: BuildOverrides = {},
): Promise<InvitationCalendar> {
  const result = await buildResult(overrides);
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result.calendar;
}

async function buildResult(overrides: BuildOverrides = {}) {
  return buildInvitationCalendar({
    seat: overrides.seat ?? seat(),
    baseUid: overrides.baseUid ?? "base-uid@sogverse",
    sequence: overrides.sequence ?? 0,
    method: overrides.method ?? "REQUEST",
    shape: overrides.shape ?? "series",
    reminder: overrides.reminder ?? "none",
    attendee: {
      name: overrides.attendeeName ?? "Sanna",
      email: "sanna@example.test",
    },
    translate: await getCalendarFeedTranslator("en"),
    locale: "en",
    now: NOW,
  });
}

/** Content lines, with RFC 5545's folding undone so a value can be matched whole. */
function lines(document: string): string[] {
  return document.replace(/\r\n[ \t]/g, "").split("\r\n").filter(Boolean);
}

function countOf(document: string, name: string): number {
  return lines(document).filter((line) => line.startsWith(name)).length;
}

/**
 * The one `VEVENT`'s own content lines.
 *
 * Scoped rather than matched across the whole document because the
 * `VTIMEZONE` carries `DTSTART` and `RRULE` properties of its own — the
 * transition rules — and a document-wide match for either would be reading
 * Helsinki's daylight saving as the club's schedule.
 */
function eventBody(document: string): string[] {
  const content = lines(document);
  const start = content.indexOf("BEGIN:VEVENT");
  expect(start).toBeGreaterThan(-1);
  return content.slice(start + 1, content.indexOf("END:VEVENT"));
}

/** The event's one line starting with `name`, or a failure if there are more. */
function only(document: string, name: string): string {
  const matches = eventBody(document).filter((line) => line.startsWith(name));
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe("one seat is one calendar object", () => {
  /**
   * The property the whole model rests on. RFC 5546 gives an iTIP message one
   * calendar object to describe, and a client handed several reads the first
   * and ignores the rest — so a two-slot club has to be one `VEVENT` under one
   * `UID`, not two of each.
   */
  it("states a two-slot club as one VEVENT under one UID, in both shapes", async () => {
    for (const shape of ["series", "occurrences"] as const) {
      const document = await build({ seat: TWO_SLOT_CLUB, shape });

      expect(countOf(document, "BEGIN:VEVENT")).toBe(1);
      expect(countOf(document, "UID:")).toBe(1);
    }
  });

  it("uses the stored uid verbatim, with no per-slot suffix", async () => {
    for (const shape of ["series", "occurrences"] as const) {
      const document = await build({
        seat: TWO_SLOT_CLUB,
        shape,
        baseUid: "stored-base@sogverse",
      });

      expect(only(document, "UID")).toBe("UID:stored-base@sogverse");
      // The participation id is not what identifies the object: a cancellation
      // retires the conversation and the next one starts on the same seat.
      expect(document).not.toContain(SEAT);
    }
  });

  /**
   * The whole revision mechanism in one case: an update repeats the UID so the
   * client knows which object, and raises the sequence so it knows this is
   * newer. The shape may move between the two — one participation is one UID
   * either way — which is what makes an update an update rather than a second
   * invitation under ids nobody has seen.
   */
  it("keeps the uid across an update, and across a change of shape", async () => {
    const first = await build({ seat: TWO_SLOT_CLUB, shape: "series" });
    const second = await build({
      seat: TWO_SLOT_CLUB,
      shape: "occurrences",
      sequence: 1,
    });

    expect(only(second, "UID")).toBe(only(first, "UID"));
    expect(lines(first)).toContain("SEQUENCE:0");
    expect(lines(second)).toContain("SEQUENCE:1");
  });
});

describe("the three methods", () => {
  it("states REQUEST and asks the attendee to answer", async () => {
    const document = await build({ method: "REQUEST" });
    const content = lines(document);

    expect(content).toContain("METHOD:REQUEST");
    expect(content).toContain("STATUS:CONFIRMED");
    expect(content).toContain(
      "ORGANIZER;CN=School of Gaming:mailto:sogverse@sog.gg",
    );
    expect(content).toContain(
      "ATTENDEE;CN=Sanna;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:sanna@example.test",
    );
  });

  /** A cancellation withdraws the object, and with it every session in it. */
  it("states CANCEL, cancels the one event, and still names both parties", async () => {
    const document = await build({
      seat: TWO_SLOT_CLUB,
      method: "CANCEL",
      sequence: 1,
    });
    const content = lines(document);

    expect(content).toContain("METHOD:CANCEL");
    expect(content).toContain("STATUS:CANCELLED");
    expect(countOf(document, "BEGIN:VEVENT")).toBe(1);
    // A client has to know whose event is being withdrawn, so the pair stays.
    expect(countOf(document, "ORGANIZER")).toBe(1);
    expect(countOf(document, "ATTENDEE")).toBe(1);
  });

  /**
   * The deliberately RSVP-less experience. The `ATTENDEE` is the property that
   * carries the RSVP, so that is the one a `PUBLISH` drops — the `ORGANIZER`
   * stays, because RFC 5546 requires one and because it says who the entry came
   * from, which a reader wants either way.
   */
  it("states PUBLISH with an organizer and no attendee", async () => {
    const document = await build({ method: "PUBLISH" });
    const content = lines(document);

    expect(content).toContain("METHOD:PUBLISH");
    expect(content).toContain(
      "ORGANIZER;CN=School of Gaming:mailto:sogverse@sog.gg",
    );
    expect(countOf(document, "ATTENDEE")).toBe(0);
  });
});

describe("the series shape", () => {
  /**
   * One rule for the whole schedule: `DTSTART` on the first session still
   * ahead, `BYDAY` naming every weekday the product runs on, and a `DURATION`
   * rather than a `DTEND` because a rule's occurrences each need their own end.
   */
  it("states one rule over every slot weekday, in RFC order", async () => {
    const document = await build({
      seat: seat({
        slots: [
          // Deliberately out of order: the rule's day list is not the author's.
          { weekday: 4, startTime: "16:30", durationMinutes: 90 },
          { weekday: 0, startTime: "16:30", durationMinutes: 90 },
          { weekday: 2, startTime: "16:30", durationMinutes: 90 },
        ],
      }),
      shape: "series",
    });
    const content = lines(document);

    expect(content).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(content).toContain("DURATION:PT90M");
    expect(countOf(document, "DTEND")).toBe(0);
    expect(countOf(document, "RDATE")).toBe(0);
  });

  /** A wall clock in the product's zone, so a DST transition does not move it. */
  it("anchors the rule on the first session still ahead, as a wall clock", async () => {
    const document = await build({ seat: TWO_SLOT_CLUB, shape: "series" });

    // `NOW` is Monday 2 March 2026; the club's first session ahead is Tuesday
    // the 3rd at 16:30 Helsinki time.
    expect(only(document, "DTSTART")).toBe(
      "DTSTART;TZID=Europe/Helsinki:20260303T163000",
    );
  });

  it("carries an UNTIL for a dated run and none for an open-ended one", async () => {
    const openEnded = await build({ shape: "series" });
    expect(only(openEnded, "RRULE")).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO");

    const dated = await build({
      shape: "series",
      seat: seat({ startDate: "2026-01-05", endDate: "2026-05-25" }),
    });
    // The end date's local end of day, as an absolute instant: 25 May 2026 is
    // inside EEST, so 23:59:59.999 Helsinki is 20:59:59 UTC.
    expect(only(dated, "RRULE")).toBe(
      "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260525T205959Z",
    );
  });

  /**
   * A rule carries one clock face. Two slots that disagree about the time of
   * day, or about how long a session runs, are not something one rule can say —
   * and the builder refuses rather than quietly sending the other notation,
   * because which notation a client is handed is what the tool is comparing.
   */
  it("refuses a schedule a rule cannot state", async () => {
    for (const differing of [DIFFERENT_TIMES, DIFFERENT_LENGTHS]) {
      const result = await buildResult({ seat: differing, shape: "series" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("rule-cannot-express-schedule");
      }
    }
  });

  it("accepts differing weekdays as long as the clock face is one", async () => {
    const result = await buildResult({ seat: TWO_SLOT_CLUB, shape: "series" });
    expect(result.ok).toBe(true);
  });
});

describe("the occurrences shape", () => {
  /**
   * The explicit list: the first session as `DTSTART`, every later one as an
   * `RDATE` in the same zone. Wall clocks rather than instants, for the same
   * reason the rule uses one — the list has to survive a DST transition inside
   * the run.
   */
  it("lists every remaining occurrence as an RDATE wall clock", async () => {
    const calendar = await buildCalendar({
      seat: TWO_SLOT_CLUB,
      shape: "occurrences",
    });
    const document = calendar.ics;

    const rdate = only(document, "RDATE");
    expect(rdate.startsWith("RDATE;TZID=Europe/Helsinki:")).toBe(true);

    const dates = rdate.slice("RDATE;TZID=Europe/Helsinki:".length).split(",");
    // The object covers the DTSTART plus every listed date, and nothing else.
    expect(dates).toHaveLength(calendar.occurrenceCount - 1);
    for (const date of dates) expect(date).toMatch(/^\d{8}T163000$/);
  });

  /** Two slots at different times is exactly what this shape buys. */
  it("states slots at different times of day, each at its own clock face", async () => {
    const document = await build({
      seat: DIFFERENT_TIMES,
      shape: "occurrences",
    });
    const rdate = only(document, "RDATE");

    expect(rdate).toContain("T163000");
    expect(rdate).toContain("T173000");
  });

  /**
   * Differing lengths are the one thing the format handles badly. RFC 5545
   * §3.8.5.2 allows mixing value types across `RDATE` properties, so the
   * occurrences that do not match the `DURATION` become period entries — and
   * only those, so a client that ignores periods still receives every
   * occurrence that the plain list could carry.
   */
  it("emits period entries only for the occurrences whose length differs", async () => {
    const calendar = await buildCalendar({
      seat: DIFFERENT_LENGTHS,
      shape: "occurrences",
    });
    const content = lines(calendar.ics);

    expect(calendar.usesPeriodRdates).toBe(true);
    expect(content).toContain("DURATION:PT90M");

    const plain = content.filter((line) =>
      line.startsWith("RDATE;TZID=Europe/Helsinki:"),
    );
    const periods = content.filter((line) =>
      line.startsWith("RDATE;VALUE=PERIOD;TZID=Europe/Helsinki:"),
    );
    expect(plain).toHaveLength(1);
    expect(periods).toHaveLength(1);
    for (const entry of periods[0]
      .slice("RDATE;VALUE=PERIOD;TZID=Europe/Helsinki:".length)
      .split(",")) {
      expect(entry).toMatch(/^\d{8}T163000\/PT120M$/);
    }
  });

  it("needs no period entries when every session is the same length", async () => {
    const calendar = await buildCalendar({
      seat: TWO_SLOT_CLUB,
      shape: "occurrences",
    });

    expect(calendar.usesPeriodRdates).toBe(false);
    expect(calendar.ics).not.toContain("VALUE=PERIOD");
  });

  /**
   * The feed carries a week of look-back so a subscription reads complete for
   * the current week. An invitation must not: a client would put an RSVP
   * prompt on a session that already happened.
   */
  it("invites to nothing that has already happened", async () => {
    const document = await build({ seat: TWO_SLOT_CLUB, shape: "occurrences" });
    const stamps = [
      only(document, "DTSTART").slice("DTSTART;TZID=Europe/Helsinki:".length),
      ...only(document, "RDATE")
        .slice("RDATE;TZID=Europe/Helsinki:".length)
        .split(","),
    ];

    for (const stamp of stamps) {
      // The wall clock is Helsinki's; March is EET, so +02:00.
      const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}+02:00`;
      expect(new Date(iso).getTime()).toBeGreaterThanOrEqual(NOW.getTime());
    }
  });
});

describe("the zone the document names", () => {
  /**
   * Both shapes state a wall clock now, so every document names a `TZID` and
   * owes the reader either the transition rules for it or a note saying why it
   * has none.
   */
  it("emits the VTIMEZONE, and no note, for the zone it does describe", async () => {
    for (const shape of ["series", "occurrences"] as const) {
      const document = await build({ shape });
      const content = lines(document);

      expect(content).toContain("BEGIN:VTIMEZONE");
      expect(content).toContain("TZID:Europe/Helsinki");
      expect(countOf(document, "X-SOGVERSE-NOTE")).toBe(0);
    }
  });

  /**
   * The sandbox offers four zones and this writer ships transition rules for
   * one of them. A `TZID` naming any of the other three is legal and every
   * mainstream client resolves it from its own database — but a document that
   * says nothing about the gap reads as one that has no gap, so it says so.
   */
  it("notes a zone it cannot describe instead of emitting a VTIMEZONE", async () => {
    const document = await build({
      shape: "series",
      seat: seat({ timezone: "Europe/Stockholm" }),
    });
    const content = lines(document);

    expect(countOf(document, "BEGIN:VTIMEZONE")).toBe(0);
    expect(
      content.some(
        (line) =>
          line.startsWith("X-SOGVERSE-NOTE:") &&
          line.includes("Europe/Stockholm"),
      ),
    ).toBe(true);
    // The event still states the zone: the note explains the omission, it does
    // not stand in for the reference.
    expect(
      content.some((line) => line.startsWith("DTSTART;TZID=Europe/Stockholm:")),
    ).toBe(true);
  });
});

describe("reminders", () => {
  it("emits no alarm when none is asked for", async () => {
    expect(countOf(await build({ reminder: "none" }), "BEGIN:VALARM")).toBe(0);
  });

  /** One alarm on the one object, which fires before each of its occurrences. */
  it("emits one alarm at the chosen offset", async () => {
    for (const [reminder, trigger] of [
      ["15", "-PT15M"],
      ["60", "-PT60M"],
      ["1440", "-PT1440M"],
    ] as const) {
      const document = await build({ seat: TWO_SLOT_CLUB, reminder });
      expect(countOf(document, "BEGIN:VALARM")).toBe(1);
      expect(lines(document)).toContain(`TRIGGER:${trigger}`);
      expect(lines(document)).toContain("ACTION:DISPLAY");
    }
  });

  /**
   * A reminder attached to a withdrawn event is a notification about something
   * that is not happening.
   */
  it("drops the alarm from a cancellation", async () => {
    const document = await build({ reminder: "60", method: "CANCEL" });
    expect(countOf(document, "BEGIN:VALARM")).toBe(0);
  });
});

describe("escaping", () => {
  it("escapes a comma and a semicolon in a TEXT value", async () => {
    const document = await build({
      seat: seat({ productName: "Club, evening; second half" }),
    });

    expect(only(document, "SUMMARY")).toContain(
      "Club\\, evening\\; second half",
    );
  });

  /**
   * A parameter value is not a TEXT value: RFC 5545 has no backslash escape
   * there, so a name carrying `:`, `;` or `,` has to be a quoted-string instead.
   */
  it("quotes a CN that carries a comma or a semicolon", async () => {
    const document = await build({ attendeeName: "Virtanen, Sanna; parent" });
    const attendee = only(document, "ATTENDEE;CN=");

    expect(attendee).toContain('CN="Virtanen, Sanna; parent"');
    expect(attendee).not.toContain("\\,");
  });

  it("drops a double quote from a CN, which a quoted-string cannot carry", async () => {
    const document = await build({ attendeeName: 'Sanna "the boss", parent' });

    expect(only(document, "ATTENDEE;CN=")).toContain(
      'CN="Sanna the boss, parent"',
    );
  });
});

describe("the occurrence count", () => {
  /**
   * The count is what the caller refuses on: a seat whose run is already over
   * covers no sessions, and an empty `VCALENDAR` says nothing to a client while
   * still consuming a `UID` and a sequence for an entry that never appears.
   *
   * It counts sessions, not events — both shapes describe the same run, so both
   * answer the same number for the same seat.
   */
  it("counts the sessions the one object covers, the same in both shapes", async () => {
    const asRule = await buildCalendar({
      seat: TWO_SLOT_CLUB,
      shape: "series",
    });
    const asList = await buildCalendar({
      seat: TWO_SLOT_CLUB,
      shape: "occurrences",
    });

    expect(asRule.occurrenceCount).toBeGreaterThan(1);
    expect(asList.occurrenceCount).toBe(asRule.occurrenceCount);
  });

  it("is zero for a run that is already over", async () => {
    const finished = await buildCalendar({
      shape: "occurrences",
      seat: seat({ startDate: "2025-01-06", endDate: "2025-02-28" }),
    });

    expect(finished.occurrenceCount).toBe(0);
    expect(finished.ics).not.toContain("BEGIN:VEVENT");
  });

  /**
   * "Nothing left to invite anybody to" is the truer thing to tell the admin
   * than "a rule cannot say this", so the empty run is answered first even when
   * the schedule is one a rule could never have stated.
   */
  it("answers a finished run rather than refusing its shape", async () => {
    const result = await buildResult({
      shape: "series",
      seat: seat({
        slots: DIFFERENT_TIMES.slots,
        startDate: "2025-01-06",
        endDate: "2025-02-28",
      }),
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.calendar.occurrenceCount).toBe(0);
  });
});

describe("the document as a whole", () => {
  it("carries the calendar preamble and CRLF endings throughout", async () => {
    const document = await build();

    expect(document.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(document.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(lines(document)).toContain("VERSION:2.0");
    expect(lines(document)).toContain("CALSCALE:GREGORIAN");
    expect(lines(document)).toContain("PRODID:-//School of Gaming//Sogverse//EN");
    // A bare LF anywhere would break a strict parser.
    expect(/[^\r]\n/.test(document)).toBe(false);
  });

  it("carries the localized summary, description and location", async () => {
    const content = lines(await build());

    expect(content).toContain("SUMMARY:Monday club – Aino");
    expect(content.some((line) => line.startsWith("DESCRIPTION:"))).toBe(true);
    expect(content).toContain("LOCATION:Online");
  });

  /** An invitation is an appointment somebody is being asked to keep. */
  it("occupies the time rather than showing free", async () => {
    expect(lines(await build())).toContain("TRANSP:OPAQUE");
  });
});
