import { describe, expect, it } from "vitest";
import type { FeedSeat } from "@/lib/calendar-feed/events";
import { getCalendarFeedTranslator } from "@/lib/calendar-feed/translator";
import { buildInvitationCalendar } from "@/lib/calendar-invitations/invitation";
import type { InvitationMethod, InvitationReminder, InvitationShape } from "@/lib/calendar-invitations/options";

/**
 * One seat rendered as an iTIP message.
 *
 * What is worth pinning here is not the serialisation — the shared writer's own
 * tests already cover folding, escaping and both timestamp forms — but the
 * three properties that make this a *message* rather than a document: who is
 * asking whom, which revision it is, and whether the client is being told to
 * add an event or to remove one.
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

  it("states CANCEL, cancels the event, and still names both parties", async () => {
    const document = await build({ method: "CANCEL", sequence: 1 });
    const content = lines(document);

    expect(content).toContain("METHOD:CANCEL");
    expect(content).toContain("STATUS:CANCELLED");
    // A client has to know whose event is being withdrawn, so the pair stays.
    expect(countOf(document, "ORGANIZER")).toBe(1);
    expect(countOf(document, "ATTENDEE")).toBe(1);
  });

  /**
   * The deliberately RSVP-less experience. Naming an organizer and an attendee
   * is exactly what would turn it back into a question.
   */
  it("states PUBLISH with neither an organizer nor an attendee", async () => {
    const document = await build({ method: "PUBLISH" });
    const content = lines(document);

    expect(content).toContain("METHOD:PUBLISH");
    expect(countOf(document, "ORGANIZER")).toBe(0);
    expect(countOf(document, "ATTENDEE")).toBe(0);
  });
});

describe("uid and sequence", () => {
  /**
   * The whole mechanism in one case: an update repeats the UID so the client
   * knows which event, and raises the sequence so it knows this is newer.
   */
  it("keeps the uid and raises only the sequence across an update", async () => {
    const first = lines(await build({ sequence: 0 }));
    const second = lines(await build({ sequence: 1 }));

    const uidOf = (content: string[]) =>
      content.filter((line) => line.startsWith("UID:"));

    expect(uidOf(second)).toEqual(uidOf(first));
    expect(first).toContain("SEQUENCE:0");
    expect(second).toContain("SEQUENCE:1");
  });

  it("hangs every event's uid off the stored base", async () => {
    const document = await build({ baseUid: "stored-base@sogverse" });
    for (const line of lines(document).filter((l) => l.startsWith("UID:"))) {
      expect(line.endsWith("stored-base@sogverse")).toBe(true);
    }
    // And the participation id is not what identifies it: a cancellation
    // retires the conversation and the next one starts on the same seat.
    expect(document).not.toContain(SEAT);
  });

  it("gives a two-slot club one uid per slot", async () => {
    const document = await build({
      seat: seat({
        slots: [
          { weekday: 1, startTime: "16:30", durationMinutes: 90 },
          { weekday: 3, startTime: "16:30", durationMinutes: 90 },
        ],
      }),
    });
    const uids = lines(document).filter((line) => line.startsWith("UID:"));

    expect(uids).toHaveLength(2);
    expect(new Set(uids).size).toBe(2);
  });
});

describe("shape", () => {
  it("states a series as a TZID wall clock with a rule and a VTIMEZONE", async () => {
    const document = await build({ shape: "series" });
    const content = lines(document);

    expect(content).toContain("BEGIN:VTIMEZONE");
    expect(content).toContain("TZID:Europe/Helsinki");
    expect(
      content.some((line) =>
        line.startsWith("DTSTART;TZID=Europe/Helsinki:2026"),
      ),
    ).toBe(true);
    expect(content).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO");
    expect(countOf(document, "BEGIN:VEVENT")).toBe(1);
  });

  /**
   * A weekly rule hung off a UTC instant drifts an hour across a DST
   * transition while the schedule it describes does not move — which is why
   * the zoned form is the series form, and the absolute form is only ever used
   * where each date is stated in full.
   */
  it("states occurrences as absolute instants, one event each", async () => {
    const document = await build({ shape: "occurrences" });
    const content = lines(document);

    expect(countOf(document, "BEGIN:VEVENT")).toBeGreaterThan(1);
    expect(countOf(document, "RRULE")).toBe(0);
    expect(countOf(document, "BEGIN:VTIMEZONE")).toBe(0);
    for (const line of content.filter((l) => l.startsWith("DTSTART"))) {
      expect(line).toMatch(/^DTSTART:\d{8}T\d{6}Z$/);
    }
  });

  /**
   * The feed carries a week of look-back so a subscription reads complete for
   * the current week. An invitation must not: a client would put an RSVP
   * prompt on a session that already happened.
   */
  it("invites to nothing that has already happened", async () => {
    const document = await build({ shape: "occurrences" });
    for (const line of lines(document).filter((l) => l.startsWith("DTSTART:"))) {
      const stamp = line.slice("DTSTART:".length);
      const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;
      expect(new Date(iso).getTime()).toBeGreaterThanOrEqual(NOW.getTime());
    }
  });
});

describe("reminders", () => {
  it("emits no alarm when none is asked for", async () => {
    expect(countOf(await build({ reminder: "none" }), "BEGIN:VALARM")).toBe(0);
  });

  it("emits one alarm at the chosen offset", async () => {
    for (const [reminder, trigger] of [
      ["15", "-PT15M"],
      ["60", "-PT60M"],
      ["1440", "-PT1440M"],
    ] as const) {
      const document = await build({ reminder });
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
    const summary = lines(document).find((line) => line.startsWith("SUMMARY:"));

    expect(summary).toContain("Club\\, evening\\; second half");
  });

  /**
   * A parameter value is not a TEXT value: RFC 5545 has no backslash escape
   * there, so a name carrying `:`, `;` or `,` has to be a quoted-string instead.
   */
  it("quotes a CN that carries a comma or a semicolon", async () => {
    const document = await build({ attendeeName: "Virtanen, Sanna; parent" });
    const attendee = lines(document).find((line) =>
      line.startsWith("ATTENDEE;CN="),
    );

    expect(attendee).toContain('CN="Virtanen, Sanna; parent"');
    expect(attendee).not.toContain("\\,");
  });

  it("drops a double quote from a CN, which a quoted-string cannot carry", async () => {
    const document = await build({ attendeeName: 'Sanna "the boss", parent' });
    const attendee = lines(document).find((line) =>
      line.startsWith("ATTENDEE;CN="),
    );

    expect(attendee).toContain('CN="Sanna the boss, parent"');
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
