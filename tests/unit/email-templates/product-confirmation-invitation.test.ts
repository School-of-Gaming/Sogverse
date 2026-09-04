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
const ENROLLMENT_URL = `https://sogverse.sog.gg/parent/clubs/${PARTICIPATION_ID}`;

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
  productTopic: "minecraft_java",
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
  enrollmentUrl: ENROLLMENT_URL,
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

  it("links the seat's own enrollment page", () => {
    expect(lineStartingWith(compose()!.ics, "URL")).toBe(`URL:${ENROLLMENT_URL}`);
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

  it("states the schedule in words, with the zone named", () => {
    const invitation = compose({
      slots: [
        { weekday: 0, startTime: "16:00", durationMinutes: 60 },
        { weekday: 2, startTime: "16:00", durationMinutes: 60 },
      ],
    });

    expect(invitation!.scheduleLines[0]).toBe("Every Monday and Wednesday, 16:00–17:00");
    expect(invitation!.scheduleLines.join("\n")).toContain("Eastern European");
    expect(description(invitation!.ics)).toContain("Every Monday and Wednesday");
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

  it("states an open-ended run as a start with no end", () => {
    const lines = compose()!.scheduleLines.join("\n");

    expect(lines).toContain("From ");
    expect(lines).not.toContain(" to ");
  });

  it("states a bounded run as a range", () => {
    const lines = compose({ endDate: "2027-05-31" })!.scheduleLines.join("\n");

    expect(lines).toMatch(/From .+ to .+/);
  });

  it("reminds a parent to link the game account the topic is about", () => {
    expect(description(compose()!.ics)).toContain(
      "Aino needs a Minecraft account linked in My SOG",
    );
    expect(
      description(compose({ isSelfSeat: true, participantName: "Marja" })!.ics),
    ).toContain("You need a Minecraft account linked in My SOG");
  });

  /**
   * Most topics are about no single account a child holds — subject matter, or
   * a game we store no identity for — so asking for one there would be asking
   * for something that does not exist.
   */
  it("asks for no account where the topic is about none", () => {
    expect(description(compose({ productTopic: "programming" })!.ics)).not.toContain(
      "linked in My SOG",
    );
  });

  it("ends with the My SOG link and a way to reach a human", () => {
    const text = description(compose()!.ics);

    expect(text).toContain(ENROLLMENT_URL);
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
  });
});
