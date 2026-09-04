import { describe, it, expect, beforeAll } from "vitest";
import {
  composeProductConfirmationInvitation,
  type ProductConfirmationInvitationInput,
} from "@/lib/email-templates/product-confirmation-invitation";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { VOICE_CONFIG } from "@/lib/constants/voice";

/**
 * A product's schedule as one calendar object.
 *
 * **`now` is pinned, because the answer depends on it.** `DTSTART` is the first
 * occurrence still ahead, so every assertion here would be true only on the day
 * it was written if the composer read a clock of its own — which is exactly why
 * it does not.
 *
 * What is asserted is the document's own bytes plus the two lines the mail
 * restates, because those are what a client and a reader actually meet. The
 * builder's own properties are `invitation.test.ts`'s subject; what is checked
 * here is the mapping from a product to them.
 */

/** Monday 4 January 2027, 10:00 in Helsinki (winter, so UTC+02:00). */
const NOW = new Date("2027-01-04T08:00:00Z");

const PARTICIPATION_ID = "3f9c2b7e-5d14-4a8e-9c61-0b2f7e8d4a15";
/** The mail's own button, and the entry's `URL`: one link, because a seat's own
 *  page needs a group most seats do not have when this mail is composed. */
const DASHBOARD_URL = "https://sogverse.sog.gg/parent";

let t: EmailTranslator;

beforeAll(async () => {
  t = await getEmailTranslator("en");
});

const base: ProductConfirmationInvitationInput = {
  participationId: PARTICIPATION_ID,
  participantName: "Aino",
  isSelfSeat: false,
  productName: "Minecraft 101",
  productType: "consumer_club",
  shortDescription: "Build, explore and survive together.",
  timezone: "Europe/Helsinki",
  startDate: "2027-01-04",
  endDate: null,
  slots: [{ weekday: 0, startTime: "16:00", durationMinutes: 60 }],
  isRemote: true,
  siteName: null,
  siteAddress: null,
  siteNote: null,
  attendeeName: "Marja Virtanen",
  attendeeEmail: "marja@example.com",
  dashboardUrl: DASHBOARD_URL,
  now: NOW,
};

function compose(overrides: Partial<ProductConfirmationInvitationInput> = {}) {
  return composeProductConfirmationInvitation(t, "en", { ...base, ...overrides });
}

/**
 * The components that describe the event, without the zone block above them.
 *
 * A `VTIMEZONE` states `DTSTART` and `RRULE` lines of its own — the transition
 * rules — and they come first in the document, so a search over the whole
 * string answers about the zone table rather than about the session.
 */
function eventBody(ics: string): string {
  const start = ics.indexOf("BEGIN:VEVENT");
  return start === -1 ? ics : ics.slice(start);
}

/** The one line of the event that starts with a name, unfolded. */
function lineStartingWith(ics: string, prefix: string): string {
  const unfolded = eventBody(ics).replace(/\r\n /g, "");
  const line = unfolded.split("\r\n").find((candidate) => candidate.startsWith(prefix));
  if (line === undefined) throw new Error(`no line starting with ${prefix}`);
  return line;
}

function linesStartingWith(ics: string, prefix: string): string[] {
  return eventBody(ics)
    .replace(/\r\n /g, "")
    .split("\r\n")
    .filter((line) => line.startsWith(prefix));
}

/** The `DESCRIPTION`, with RFC 5545's escapes undone so it reads as text. */
function description(ics: string): string {
  return lineStartingWith(ics, "DESCRIPTION:")
    .slice("DESCRIPTION:".length)
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";");
}

describe("the shapes a product's schedule takes", () => {
  it("states an event as a single occurrence on its own date", () => {
    // Wednesday 6 January 2027. An event has one session and one clock face, so
    // there is no rule to state and nothing for an override to name.
    const invitation = compose({
      productType: "event",
      startDate: "2027-01-06",
      endDate: "2027-01-06",
      slots: [{ weekday: 2, startTime: "10:00", durationMinutes: 120 }],
    });

    expect(invitation).not.toBeNull();
    expect(lineStartingWith(invitation!.ics, "DTSTART")).toBe(
      "DTSTART;TZID=Europe/Helsinki:20270106T100000",
    );
    expect(lineStartingWith(invitation!.ics, "DURATION")).toBe("DURATION:PT120M");
    // The zone block above it states rules of its own, so the absence has to be
    // asserted on the event rather than on the document.
    expect(linesStartingWith(invitation!.ics, "RRULE")).toEqual([]);
  });

  it("states an open-ended club as a weekly rule with no last day", () => {
    const invitation = compose();

    expect(lineStartingWith(invitation!.ics, "RRULE")).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO");
    expect(invitation!.ics).not.toContain("UNTIL");
  });

  it("puts every slot's weekday in one BYDAY when they share a clock face", () => {
    const invitation = compose({
      slots: [
        { weekday: 0, startTime: "16:00", durationMinutes: 60 },
        { weekday: 2, startTime: "16:00", durationMinutes: 60 },
      ],
    });

    expect(lineStartingWith(invitation!.ics, "RRULE")).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO,WE");
    // One shape, so nothing is overridden — the master states it for every day.
    expect(invitation!.ics).not.toContain("RECURRENCE-ID");
  });

  it("stops a term-bounded club on its end date", () => {
    const invitation = compose({
      productType: "municipality_club",
      endDate: "2027-05-31",
    });

    // The end of the last day **in the product's own zone**: a run ends when
    // that day ends where the sessions are.
    expect(lineStartingWith(invitation!.ics, "RRULE")).toBe(
      "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20270531T205959Z",
    );
  });

  /**
   * A camp that meets at two clock faces cannot be one rule, so the rule states
   * the ordinary case and every disagreeing occurrence is its own component
   * under the same identifier. The `RECURRENCE-ID` names the occurrence **as the
   * rule produced it** — that day at the master's own time — which is the value
   * a client can match against what it already holds.
   */
  it("states a mixed-time camp as a rule plus one override per disagreeing day", () => {
    const invitation = compose({
      productType: "camp",
      startDate: "2027-01-04",
      endDate: "2027-01-12",
      slots: [
        { weekday: 0, startTime: "11:00", durationMinutes: 180 },
        { weekday: 1, startTime: "13:00", durationMinutes: 120 },
      ],
    });

    expect(lineStartingWith(invitation!.ics, "DTSTART;TZID")).toBe(
      "DTSTART;TZID=Europe/Helsinki:20270104T110000",
    );
    expect(lineStartingWith(invitation!.ics, "RRULE")).toContain("BYDAY=MO,TU");

    // The two Tuesdays in the run, each moved to its own time and length.
    expect(linesStartingWith(invitation!.ics, "RECURRENCE-ID")).toEqual([
      "RECURRENCE-ID;TZID=Europe/Helsinki:20270105T110000",
      "RECURRENCE-ID;TZID=Europe/Helsinki:20270112T110000",
    ]);
    const starts = linesStartingWith(invitation!.ics, "DTSTART;TZID");
    expect(starts).toEqual([
      "DTSTART;TZID=Europe/Helsinki:20270104T110000",
      "DTSTART;TZID=Europe/Helsinki:20270105T130000",
      "DTSTART;TZID=Europe/Helsinki:20270112T130000",
    ]);
    expect(linesStartingWith(invitation!.ics, "DURATION")).toEqual([
      "DURATION:PT180M",
      "DURATION:PT120M",
      "DURATION:PT120M",
    ]);
  });

  /**
   * A signup after a club has begun must not put finished sessions in a
   * calendar: `RRULE` counts `DTSTART` as its first instance, so moving it
   * forward moves the whole run forward with it.
   */
  it("starts at the next occurrence still ahead, never at the product's start date", () => {
    const invitation = compose({ startDate: "2026-09-01" });

    expect(lineStartingWith(invitation!.ics, "DTSTART")).toBe(
      "DTSTART;TZID=Europe/Helsinki:20270104T160000",
    );
    // The *stated* dates still say when the club runs from, because that is a
    // fact about the product rather than about this seat.
    expect(invitation!.scheduleLines.join("\n")).toContain("2026");
  });

  it("skips the day whose clock face has already gone by", () => {
    // 18:00 in Helsinki, past a 16:00 Monday slot: the next occurrence is the
    // Monday after, which is what the eighth day of the search is there for.
    const invitation = compose({ now: new Date("2027-01-04T16:00:00Z") });

    expect(lineStartingWith(invitation!.ics, "DTSTART")).toBe(
      "DTSTART;TZID=Europe/Helsinki:20270111T160000",
    );
  });
});

/**
 * The two days a year the offset moves, which is where every date walk in this
 * module either holds or quietly loses a day.
 *
 * Europe/Helsinki in 2027: the clocks go forward on Sunday 28 March at 03:00
 * local, and back on Sunday 31 October at 04:00 local. A run that crosses
 * either one is the case a UTC-pinned walk exists for — stepping a zoned wall
 * clock by 24 hours repeats or skips a calendar date exactly here, and nothing
 * outside these dates would notice.
 */
describe("a run that crosses a daylight-saving transition", () => {
  /**
   * `UNTIL` is an absolute instant, so the same wall clock is a different `Z`
   * value on each side of the switch: the end of a winter day is 21:59:59Z at
   * UTC+02:00, and the end of a summer day is 20:59:59Z at UTC+03:00.
   */
  it("reads the last day's end in the offset in force on that day", () => {
    const winter = compose({ productType: "municipality_club", endDate: "2027-12-31" });

    expect(lineStartingWith(winter!.ics, "RRULE")).toBe(
      "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20271231T215959Z",
    );
  });

  /**
   * The first-occurrence search walks bare dates and builds exactly one
   * instant, to compare against `now`. A walk that stepped a zoned wall clock
   * instead would land on the 27th or the 29th here, and only here.
   */
  it("lands the first occurrence on the transition day itself", () => {
    // Saturday 27 March, the day before the clocks go forward.
    const invitation = compose({
      startDate: "2027-03-01",
      slots: [{ weekday: 6, startTime: "10:00", durationMinutes: 90 }],
      now: new Date("2027-03-27T12:00:00Z"),
    });

    expect(lineStartingWith(invitation!.ics, "DTSTART;TZID")).toBe(
      "DTSTART;TZID=Europe/Helsinki:20270328T100000",
    );
  });

  /**
   * The override walk runs day by day from `DTSTART` to the last day, and every
   * `RECURRENCE-ID` names the occurrence **as the rule produced it** — that
   * date at the master's own clock face. A day repeated or skipped here would
   * be an override matching no occurrence, which a client answers by creating a
   * second entry beside the one it was meant to replace.
   */
  it("steps every overridden day by the calendar, across the switch", () => {
    // Friday 26 March to Tuesday 30 March, with the transition on the Sunday.
    const invitation = compose({
      productType: "camp",
      startDate: "2027-03-26",
      endDate: "2027-03-30",
      now: new Date("2027-03-25T12:00:00Z"),
      slots: [
        { weekday: 4, startTime: "09:00", durationMinutes: 120 },
        { weekday: 5, startTime: "14:00", durationMinutes: 120 },
        { weekday: 6, startTime: "14:00", durationMinutes: 120 },
        { weekday: 0, startTime: "14:00", durationMinutes: 120 },
        { weekday: 1, startTime: "14:00", durationMinutes: 120 },
      ],
    });

    expect(lineStartingWith(invitation!.ics, "DTSTART;TZID")).toBe(
      "DTSTART;TZID=Europe/Helsinki:20270326T090000",
    );
    expect(linesStartingWith(invitation!.ics, "RECURRENCE-ID")).toEqual([
      "RECURRENCE-ID;TZID=Europe/Helsinki:20270327T090000",
      "RECURRENCE-ID;TZID=Europe/Helsinki:20270328T090000",
      "RECURRENCE-ID;TZID=Europe/Helsinki:20270329T090000",
      "RECURRENCE-ID;TZID=Europe/Helsinki:20270330T090000",
    ]);
    // Each of them moved to its own time, and the master kept its own.
    expect(linesStartingWith(invitation!.ics, "DTSTART;TZID")).toEqual([
      "DTSTART;TZID=Europe/Helsinki:20270326T090000",
      "DTSTART;TZID=Europe/Helsinki:20270327T140000",
      "DTSTART;TZID=Europe/Helsinki:20270328T140000",
      "DTSTART;TZID=Europe/Helsinki:20270329T140000",
      "DTSTART;TZID=Europe/Helsinki:20270330T140000",
    ]);
  });

  /**
   * The autumn mirror, and the harsher of the two: 31 October is a **25-hour
   * day**, so a walk that steps 24 hours of elapsed time from the run's first
   * local midnight lands twice on the 31st and never reaches the 2nd. Simulated
   * against this exact run, such a walk yields 29, 30, 31, **31**, 01 — one
   * `RECURRENCE-ID` naming an occurrence the rule already had, and one day of
   * the camp with no component at all.
   */
  it("writes one override per day across the autumn fall-back, none twice", () => {
    // Friday 29 October to Tuesday 2 November, with the transition on the
    // Sunday.
    const invitation = compose({
      productType: "camp",
      startDate: "2027-10-29",
      endDate: "2027-11-02",
      now: new Date("2027-10-28T12:00:00Z"),
      slots: [
        { weekday: 4, startTime: "09:00", durationMinutes: 120 },
        { weekday: 5, startTime: "14:00", durationMinutes: 120 },
        { weekday: 6, startTime: "14:00", durationMinutes: 120 },
        { weekday: 0, startTime: "14:00", durationMinutes: 120 },
        { weekday: 1, startTime: "14:00", durationMinutes: 120 },
      ],
    });

    expect(lineStartingWith(invitation!.ics, "DTSTART;TZID")).toBe(
      "DTSTART;TZID=Europe/Helsinki:20271029T090000",
    );
    const recurrenceIds = linesStartingWith(invitation!.ics, "RECURRENCE-ID");
    expect(recurrenceIds).toEqual([
      "RECURRENCE-ID;TZID=Europe/Helsinki:20271030T090000",
      "RECURRENCE-ID;TZID=Europe/Helsinki:20271031T090000",
      "RECURRENCE-ID;TZID=Europe/Helsinki:20271101T090000",
      "RECURRENCE-ID;TZID=Europe/Helsinki:20271102T090000",
    ]);
    // Stated separately from the list above, because the duplicate is what the
    // 25-hour day produces and a list assertion can be widened without anyone
    // noticing it stopped forbidding one.
    expect(new Set(recurrenceIds).size).toBe(recurrenceIds.length);
  });

  /**
   * The autumn mirror of the first-occurrence walk. The reviewer's own case —
   * a Tuesday slot with `now` on Saturday 30 October — is pinned first: it is
   * the shape a reader will look for beside the spring test.
   *
   * **It is not the one that catches a naive walk**, and saying so is the
   * point: simulated, a 24-hour-elapsed walk from the 30th yields 30, 31, 31,
   * 01, 02 and still finds the Tuesday, one step later than it should. The case
   * below it is where the repeat actually costs an answer.
   */
  it("lands the first occurrence after the fall-back on the right date", () => {
    const invitation = compose({
      startDate: "2027-10-01",
      slots: [{ weekday: 1, startTime: "10:00", durationMinutes: 90 }],
      now: new Date("2027-10-30T12:00:00Z"),
    });

    expect(lineStartingWith(invitation!.ics, "DTSTART;TZID")).toBe(
      "DTSTART;TZID=Europe/Helsinki:20271102T100000",
    );
  });

  /**
   * The floor day's own weekday, its clock face already gone by — which is the
   * case the eighth day of the search exists for, and the one the repeat eats.
   * A walk that spends a step re-reading 31 October covers seven distinct days
   * in eight, so the Sunday a week out falls off the end and the composer
   * answers with no invitation at all rather than the right date.
   */
  it("recovers the floor day's own slot a week later, repeat or no repeat", () => {
    // Sunday 31 October, 14:00 in Helsinki: past a 10:00 Sunday slot.
    const invitation = compose({
      startDate: "2027-10-01",
      slots: [{ weekday: 6, startTime: "10:00", durationMinutes: 90 }],
      now: new Date("2027-10-31T12:00:00Z"),
    });

    expect(lineStartingWith(invitation!.ics, "DTSTART;TZID")).toBe(
      "DTSTART;TZID=Europe/Helsinki:20271107T100000",
    );
  });
});

/**
 * `DTSTART` is the first occurrence still ahead, and nothing says that has to
 * be the first weekday in `BYDAY`: a signup on a Tuesday starts the run on
 * Wednesday while the rule still states both days.
 */
describe("the weekday DTSTART lands on", () => {
  it("is the next one ahead, not the earliest in the rule", () => {
    const invitation = compose({
      // Tuesday 5 January 2027, 14:00 in Helsinki.
      now: new Date("2027-01-05T12:00:00Z"),
      slots: [
        { weekday: 0, startTime: "16:00", durationMinutes: 60 },
        { weekday: 2, startTime: "16:00", durationMinutes: 60 },
      ],
    });

    expect(lineStartingWith(invitation!.ics, "DTSTART;TZID")).toBe(
      "DTSTART;TZID=Europe/Helsinki:20270106T160000",
    );
    expect(lineStartingWith(invitation!.ics, "RRULE")).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO,WE");
  });
});

describe("the products that carry no invitation at all", () => {
  it("has none for a product with no schedule slots", () => {
    expect(compose({ slots: [] })).toBeNull();
  });

  it("has none for a product with no start date", () => {
    expect(compose({ startDate: null })).toBeNull();
  });

  it("has none for a run whose last day is behind us", () => {
    expect(compose({ endDate: "2026-12-31" })).toBeNull();
  });

  it("has none for an event with no slot on its own start date", () => {
    // Wednesday's date, Monday's only slot: a product with a date and no
    // session on it.
    expect(
      compose({
        productType: "event",
        startDate: "2027-01-06",
        endDate: "2027-01-06",
        slots: [{ weekday: 0, startTime: "16:00", durationMinutes: 60 }],
      }),
    ).toBeNull();
  });

  it("has none for an event whose date has passed", () => {
    expect(
      compose({
        productType: "event",
        startDate: "2026-11-04",
        endDate: "2026-11-04",
        slots: [{ weekday: 2, startTime: "10:00", durationMinutes: 120 }],
      }),
    ).toBeNull();
  });

  /**
   * The one shape RFC 5545 cannot state under a single identifier: an unbounded
   * run at two clock faces has no last day to stop writing overrides at. It is
   * not creatable today — a consumer club is the only product with no end date
   * and its form gives it one slot — and the right answer if it ever becomes
   * creatable is one series per distinct time under its own identifier.
   */
  it("has none for a mixed-time run with no end date", () => {
    expect(
      compose({
        endDate: null,
        slots: [
          { weekday: 0, startTime: "16:00", durationMinutes: 60 },
          { weekday: 2, startTime: "14:00", durationMinutes: 90 },
        ],
      }),
    ).toBeNull();
  });

  /**
   * A zone the builder ships no transition rules for gets an explorer-facing
   * `X-SOGVERSE-NOTE` in place of its `VTIMEZONE` — a diagnostic for whoever
   * typed the zone, not a line to put inside a family's calendar. The rule
   * table and the admin picker are held in lockstep so a product cannot name
   * such a zone; what still reaches here is a stored `products.timezone` the
   * picker no longer offers, and the honest answer to that is the plain mail.
   */
  it("has none for a zone this build ships no transition rules for", () => {
    expect(compose({ timezone: "Pacific/Auckland" })).toBeNull();
  });

  it("has none where one weekday carries two different sessions", () => {
    // The rule produces one occurrence per weekday, so a `RECURRENCE-ID` cannot
    // name the second of two Mondays. No invitation beats one missing a session.
    expect(
      compose({
        productType: "camp",
        endDate: "2027-02-01",
        slots: [
          { weekday: 0, startTime: "10:00", durationMinutes: 60 },
          { weekday: 0, startTime: "14:00", durationMinutes: 60 },
        ],
      }),
    ).toBeNull();
  });
});

describe("what the document says about itself", () => {
  it("derives its identifier from the participation, so an update can land later", () => {
    const invitation = compose();

    expect(invitation!.uid).toBe(`${PARTICIPATION_ID}@sogverse`);
    expect(lineStartingWith(invitation!.ics, "UID")).toBe(
      `UID:${PARTICIPATION_ID}@sogverse`,
    );
    expect(invitation!.ics).toContain("SEQUENCE:0");
    expect(invitation!.ics).toContain("METHOD:REQUEST");
    expect(invitation!.ics).toContain("STATUS:CONFIRMED");
  });

  it("asks the paying parent to answer, on behalf of the support inbox", () => {
    const invitation = compose();

    expect(lineStartingWith(invitation!.ics, "ORGANIZER")).toBe(
      `ORGANIZER;CN="School of Gaming":mailto:${SUPPORT_EMAIL}`,
    );
    expect(lineStartingWith(invitation!.ics, "ATTENDEE")).toBe(
      'ATTENDEE;CN="Marja Virtanen";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:marja@example.com',
    );
    // The gamer is never an attendee: their address is a synthetic internal one
    // no mail can reach.
    expect(invitation!.ics).not.toContain("Aino:mailto");
  });

  /**
   * Order is a real property: an Exchange mailbox keeps exactly one alarm per
   * item and keeps the first, so the day-before reminder — the one a parent can
   * still act on — has to be written first.
   */
  it("reminds a day ahead first, then an hour ahead", () => {
    const invitation = compose();

    expect(linesStartingWith(invitation!.ics, "TRIGGER")).toEqual([
      "TRIGGER:-PT1440M",
      "TRIGGER:-PT60M",
    ]);
    expect(linesStartingWith(invitation!.ics, "ACTION")).toEqual([
      "ACTION:DISPLAY",
      "ACTION:DISPLAY",
    ]);
  });

  it("blocks the parent's time rather than showing as free", () => {
    expect(compose()!.ics).toContain("TRANSP:OPAQUE");
  });

  it("writes a UTC product as absolute instants, with no zone block", () => {
    const invitation = compose({ timezone: "UTC" });

    expect(lineStartingWith(invitation!.ics, "DTSTART")).toBe("DTSTART:20270104T160000Z");
    expect(invitation!.ics).not.toContain("BEGIN:VTIMEZONE");
    expect(invitation!.ics).not.toContain("X-SOGVERSE-NOTE");
  });

  it("carries the transition rules for a zone a product can be authored in", () => {
    expect(compose()!.ics).toContain("TZID:Europe/Helsinki");
    expect(compose()!.ics).toContain("BEGIN:VTIMEZONE");
  });

  /**
   * My SOG rather than the seat's own page: that page needs a group, and a
   * seat usually has none at the moment this mail is composed — so the more
   * specific link would be the one most likely to 404, inside a document a
   * parent still holds weeks later.
   */
  it("links My SOG, the one page every seat can reach", () => {
    expect(lineStartingWith(compose()!.ics, "URL")).toBe(`URL:${DASHBOARD_URL}`);
  });

  it("writes no URL property and no link paragraph when there is no link", () => {
    const invitation = compose({ dashboardUrl: "" });

    expect(linesStartingWith(invitation!.ics, "URL")).toEqual([]);
    // A sentence promising a link and carrying none is worse than no sentence.
    expect(description(invitation!.ics)).not.toContain("My SOG:");
  });
});

describe("the entry's title", () => {
  it("names the child on a child's seat, so two of them can be told apart", () => {
    expect(lineStartingWith(compose()!.ics, "SUMMARY")).toBe(
      "SUMMARY:Minecraft 101 – Aino",
    );
  });

  it("names nobody on the parent's own seat", () => {
    const invitation = compose({ isSelfSeat: true, participantName: "Marja" });

    expect(lineStartingWith(invitation!.ics, "SUMMARY")).toBe("SUMMARY:Minecraft 101");
  });
});

describe("where it happens", () => {
  it("names the site and its address in person", () => {
    const invitation = compose({
      isRemote: false,
      siteName: "Kallion kirjasto",
      siteAddress: "Viides linja 11, 00530 Helsinki",
    });

    expect(lineStartingWith(invitation!.ics, "LOCATION")).toBe(
      "LOCATION:Kallion kirjasto\\, Viides linja 11\\, 00530 Helsinki",
    );
  });

  it("names the site alone when there is no address", () => {
    const invitation = compose({ isRemote: false, siteName: "Kallion kirjasto" });

    expect(lineStartingWith(invitation!.ics, "LOCATION")).toBe(
      "LOCATION:Kallion kirjasto",
    );
  });

  it("says where an online club happens, which is My SOG", () => {
    expect(lineStartingWith(compose()!.ics, "LOCATION")).toBe("LOCATION:Online – My SOG");
  });

  /**
   * The public site note is where "the door on the north side" lives, and it is
   * the half of the address a parent standing outside actually needs.
   */
  it("carries the public site note into the entry's own notes", () => {
    const invitation = compose({
      isRemote: false,
      siteName: "Kallion kirjasto",
      siteNote: "The door on the north side.",
    });

    expect(description(invitation!.ics)).toContain("The door on the north side.");
    expect(invitation!.placeLines).toContain("The door on the north side.");
  });

  it("states the voice window from the constant the room itself reads", () => {
    const text = description(compose()!.ics);

    expect(text).toContain(
      `${VOICE_CONFIG.SESSION_WINDOW_BEFORE_MINUTES} minutes before`,
    );
  });
});

describe("what the entry's notes say", () => {
  it("opens with the same sentence the mail does", () => {
    expect(description(compose()!.ics)).toContain("Aino is enrolled in Minecraft 101.");
  });

  it("carries the product's own short description", () => {
    expect(description(compose()!.ics)).toContain(
      "Build, explore and survive together.",
    );
  });

  /**
   * The schedule sentences are the *mail's*. A client draws the recurrence,
   * the clock face and the zone from the properties themselves, so a second
   * copy in the notes could only ever contradict what a later message changed.
   */
  it("states the schedule in words for the mail, and not in the entry", () => {
    const invitation = compose({
      slots: [
        { weekday: 0, startTime: "16:00", durationMinutes: 60 },
        { weekday: 2, startTime: "16:00", durationMinutes: 60 },
      ],
    });

    expect(invitation!.scheduleLines[0]).toBe("Every Monday and Wednesday, 16:00–17:00");
    expect(invitation!.scheduleLines.join("\n")).toContain(
      "Times are given in Finland time.",
    );

    const text = description(invitation!.ics);
    expect(text).not.toContain("Every Monday and Wednesday");
    expect(text).not.toContain("Finland time");
    // The term's own dates go with it — the run's bounds are the `RRULE`'s
    // `UNTIL` and the client's to render.
    expect(text).not.toContain("From ");
  });

  /**
   * News about what happens next goes stale where the mail it arrived in does
   * not: a parent opening this entry in week six does not need to be told a
   * group is coming. The mail's own "what happens next" bullet said it once,
   * at the moment it was true.
   */
  it("leaves the placement sentence to the mail", () => {
    expect(description(compose()!.ics)).not.toContain("group");
    expect(
      description(compose({ isSelfSeat: true, participantName: "Marja" })!.ics),
    ).not.toContain("group");
  });

  /**
   * One name for the whole run, never a seasonal reading. A name read off a
   * single instant would label a January term "Standard Time" for a schedule
   * that is mostly summer, and a camp starting in July would carry the summer
   * name into its September sessions.
   */
  it("names the zone the same way on both sides of a transition", () => {
    const winter = compose({ startDate: "2027-01-04" })!.scheduleLines.join("\n");
    // A club whose first occurrence is in July: the same line, the same name.
    const summer = compose({
      startDate: "2027-07-05",
      now: new Date("2027-06-01T08:00:00Z"),
    })!.scheduleLines.join("\n");

    expect(winter).toContain("Finland time");
    expect(summer).toContain("Finland time");
    expect(winter).not.toContain("Standard Time");
    expect(summer).not.toContain("Summer Time");
  });

  /**
   * The name is a message key per zone rather than an `Intl` reading, because
   * CLDR has no generic long name for every zone in every locale and `Intl`
   * answers a gap with a differently shaped string — a label and a separator
   * spliced into the sentence. `Europe/London` in Finnish and French was
   * exactly that: "Ajat ovat aikavyöhykkeellä aikavyöhyke: Iso-Britannia."
   */
  const ZONES = [
    "Europe/Helsinki",
    "Europe/Paris",
    "Europe/London",
    "Europe/Stockholm",
  ];

  it.each(SUPPORTED_LOCALES)("names every supported zone in %s", async (locale) => {
    const translator = await getEmailTranslator(locale);

    for (const timezone of ZONES) {
      const invitation = composeProductConfirmationInvitation(translator, locale, {
        ...base,
        timezone,
      });
      const lines = invitation!.scheduleLines.join("\n");

      // No key path standing in for a missing name, and no raw IANA identifier
      // standing in for a missing key.
      expect(lines).not.toContain("productConfirmation.");
      expect(lines).not.toContain(timezone);
    }
  });

  /**
   * The two locales the `Intl` reading broke in, pinned as whole sentences.
   * Every one of these came back as "aikavyöhyke: Iso-Britannia" shaped output
   * for London, which is the failure a per-zone key exists to make impossible.
   */
  it.each([
    ["fi", "Europe/Helsinki", "Kellonajat ovat Suomen aikaa."],
    ["fi", "Europe/London", "Kellonajat ovat Britannian aikaa."],
    ["fr", "Europe/Helsinki", "Les horaires sont donnés en heure de Finlande."],
    ["fr", "Europe/London", "Les horaires sont donnés en heure du Royaume-Uni."],
  ] as const)("reads as a sentence: %s / %s", async (locale, timezone, sentence) => {
    const translator = await getEmailTranslator(locale);
    const invitation = composeProductConfirmationInvitation(translator, locale, {
      ...base,
      timezone,
    });

    expect(invitation!.scheduleLines).toContain(sentence);
  });

  it("gives one line per distinct time when the slots disagree", () => {
    const invitation = compose({
      productType: "camp",
      endDate: "2027-01-12",
      slots: [
        { weekday: 0, startTime: "11:00", durationMinutes: 180 },
        { weekday: 1, startTime: "13:00", durationMinutes: 120 },
      ],
    });

    expect(invitation!.scheduleLines[0]).toBe("Every Monday, 11:00–14:00");
    expect(invitation!.scheduleLines[1]).toBe("Every Tuesday, 13:00–15:00");
  });

  /**
   * "Every" is a claim about repetition, and a run whose first and last day are
   * fewer than seven days apart holds each weekday at most once — so the word
   * would promise a second week the camp does not have. The days and the clock
   * face are still the fact worth stating; only the word goes.
   */
  describe("a run too short to repeat", () => {
    /** Monday 4 January to Friday 8 January 2027: each weekday once. */
    const ONE_WEEK: Partial<ProductConfirmationInvitationInput> = {
      productType: "camp",
      startDate: "2027-01-04",
      endDate: "2027-01-08",
      slots: [0, 1, 2, 3, 4].map((weekday) => ({
        weekday,
        startTime: "10:00",
        durationMinutes: 120,
      })),
    };

    it("names the days and the times without saying Every", () => {
      const invitation = compose(ONE_WEEK);

      expect(invitation!.scheduleLines[0]).toBe(
        "Monday, Tuesday, Wednesday, Thursday, and Friday, 10:00–12:00",
      );
    });

    it("still says Every once the run is long enough to repeat one", () => {
      const invitation = compose({ ...ONE_WEEK, endDate: "2027-01-15" });

      expect(invitation!.scheduleLines[0]).toBe(
        "Every Monday, Tuesday, Wednesday, Thursday, and Friday, 10:00–12:00",
      );
    });

    /**
     * Each locale's own word for it, so no message file keeps the repetition.
     * `tlh` is absent because its word is a joke rather than a translation, and
     * pinning it would make a Klingon rewrite look like a regression.
     */
    const EVERY = [
      ["en", "Every"],
      ["fi", "Joka"],
      ["sv", "Varje"],
      ["fr", "Chaque"],
    ] as const;

    it.each(EVERY)("drops the repeating word in %s", async (locale, every) => {
      const translator = await getEmailTranslator(locale);
      const short = composeProductConfirmationInvitation(translator, locale, {
        ...base,
        ...ONE_WEEK,
      });
      const long = composeProductConfirmationInvitation(translator, locale, {
        ...base,
        ...ONE_WEEK,
        endDate: "2027-01-15",
      });

      expect(short!.scheduleLines[0]).not.toContain(every);
      expect(long!.scheduleLines[0]).toContain(every);
    });
  });

  it("states an open-ended run as a start with no end", () => {
    const lines = compose()!.scheduleLines.join("\n");

    expect(lines).toContain("From ");
    expect(lines).not.toContain(" to ");
  });

  it("states a bounded run as a range", () => {
    const lines = compose({ endDate: "2027-05-31" })!.scheduleLines.join("\n");

    expect(lines).toMatch(/From .+ to .+/);
  });

  it("ends with the My SOG link and a way to reach a human", () => {
    const text = description(compose()!.ics);

    expect(text).toContain(DASHBOARD_URL);
    expect(text).toContain(SUPPORT_EMAIL);
  });

  /** Money and the age range are deliberately absent: a calendar entry is read
   *  by whoever the calendar is shared with, and neither is theirs. */
  it("states no price and no age range", () => {
    const text = description(compose()!.ics);

    expect(text).not.toContain("€");
    expect(text).not.toMatch(/\bage\b/i);
  });
});

/**
 * The whole document, in every language we send in.
 *
 * A missing key renders as its own path — `productConfirmation.invite.…` — so a
 * sweep that looks for the namespace catches an English fallback wherever it
 * leaked, in the notes, the title or the location alike. Each locale also pins
 * one word only its own translation produces, so a file that silently held the
 * English string would fail too.
 */
describe("every locale composes a whole document", () => {
  const PINNED: Record<string, string> = {
    en: "Session times",
    fi: "Tapaamisajat",
    sv: "Tider för tillfällena",
    fr: "Horaires des sessions",
    tlh: "ghom poHmey",
  };

  /**
   * A word `Intl` produces for this locale and no other, asserted **inside the
   * document**.
   *
   * The four `Intl` call sites here — the weekday, the clock face, the list
   * conjunction and the zone name — each take the locale as an argument, and a
   * hardcoded `"en"` at any of them would be invisible to a sweep that only
   * checks the message files answered. Monday is the base fixture's one slot,
   * so its name in each language is the cheapest thing to pin.
   *
   * `tlh` has no `Intl` data of its own and falls back to English weekday
   * names, which is why it is absent rather than pinned to "Monday": that
   * assertion would pass for a locale that had leaked English everywhere.
   */
  const WEEKDAY: Partial<Record<(typeof SUPPORTED_LOCALES)[number], string>> = {
    en: "Monday",
    fi: "maanantai",
    sv: "måndag",
    fr: "lundi",
  };

  /**
   * The base fixture's 16:00 slot, as each locale sets a clock face.
   *
   * Finnish separates hours from minutes with a period where English, Swedish
   * and French use a colon, so a clock formatter hardcoded to `en` reads
   * Finnish as `16:00` and fails here.
   *
   * `tlh` is absent for the same reason it is absent from the weekday map, and
   * the reason is stronger than "it falls back to English": `Intl` has no data
   * for it at all, so it resolves to the *runtime default* locale — `en-FI` on
   * one machine, `en-US` on CI — and nothing about its output is stable across
   * environments. A pin on it would pass or fail by the machine's `LANG`.
   */
  const CLOCK: Partial<Record<(typeof SUPPORTED_LOCALES)[number], string>> = {
    en: "16:00",
    fi: "16.00",
    sv: "16:00",
    fr: "16:00",
  };

  it.each(SUPPORTED_LOCALES)("%s", async (locale) => {
    const translator = await getEmailTranslator(locale);
    const invitation = composeProductConfirmationInvitation(translator, locale, {
      ...base,
      isRemote: false,
      siteName: "Kallion kirjasto",
      siteAddress: "Viides linja 11",
      siteNote: "The door on the north side.",
    });

    expect(invitation).not.toBeNull();
    expect(invitation!.ics).not.toContain("productConfirmation.");
    expect(invitation!.scheduleLines.join("\n")).not.toContain("productConfirmation.");
    expect(invitation!.placeLines.join("\n")).not.toContain("productConfirmation.");
    // The section label is not part of the document, so it is asserted through
    // the translator directly — the pin exists to prove this locale's own file
    // answered rather than English standing in for it.
    expect(translator("productConfirmation.invite.sectionLabel")).toBe(PINNED[locale]);

    // On the schedule line, because that is the only thing the four `Intl`
    // call sites feed — the document itself states no weekday and no clock
    // face in words, it states properties a client renders.
    const clock = CLOCK[locale];
    if (clock !== undefined) expect(invitation!.scheduleLines[0]).toContain(clock);

    const weekday = WEEKDAY[locale];
    if (weekday !== undefined) expect(invitation!.scheduleLines[0]).toContain(weekday);
  });
});
