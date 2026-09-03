import { describe, it, expect } from "vitest";
import {
  CALENDAR_FEED_DEFAULTS,
  CALNAME_MAX_LENGTH,
  alarmMinutes,
  calendarFeedQuery,
  horizonWeeks,
  parseCalendarFeedOptions,
  refreshDuration,
  scopedParticipantId,
} from "@/lib/calendar-feed/options";

function parse(query: string) {
  return parseCalendarFeedOptions(new URLSearchParams(query));
}

const GAMER = "33333333-3333-3333-3333-333333333333";

describe("calendar feed options", () => {
  it("answers the documented defaults for an empty query string", () => {
    expect(parse("")).toEqual({ ...CALENDAR_FEED_DEFAULTS });
  });

  it("reads every recognised value", () => {
    const options = parse(
      "alarm=15&title=gamer-product&mode=rrule&tz=tzid&weeks=26" +
        `&scope=gamer:${GAMER}&calname=Sogverse+trial&color=off` +
        "&refresh=24h&details=full&busy=busy",
    );
    expect(options).toEqual({
      alarm: "15",
      title: "gamer-product",
      mode: "rrule",
      tz: "tzid",
      weeks: "26",
      scope: `gamer:${GAMER}`,
      calname: "Sogverse trial",
      color: "off",
      refresh: "24h",
      details: "full",
      busy: "busy",
    });
  });

  /**
   * The rule the whole schema exists for: a calendar app stores the URL it was
   * given and re-fetches it forever, so a value we stop recognising must leave
   * the subscription working rather than answering 400 into an app whose owner
   * can see no error.
   */
  it("falls back to the default for an unrecognised value rather than failing", () => {
    const options = parse(
      "alarm=90&title=shouting&mode=daily&tz=local&weeks=7" +
        "&scope=everyone&color=rainbow&refresh=never&details=some&busy=maybe",
    );
    expect(options).toEqual({ ...CALENDAR_FEED_DEFAULTS });
  });

  it("keeps a valid parameter beside an invalid one", () => {
    expect(parse("alarm=none&mode=nonsense")).toMatchObject({
      alarm: "none",
      mode: CALENDAR_FEED_DEFAULTS.mode,
    });
  });

  it("trims a calendar name and refuses one that is blank or too long", () => {
    expect(parse("calname=%20%20Family%20%20").calname).toBe("Family");
    expect(parse("calname=%20%20").calname).toBe(CALENDAR_FEED_DEFAULTS.calname);
    expect(
      parse(`calname=${"x".repeat(CALNAME_MAX_LENGTH + 1)}`).calname,
    ).toBe(CALENDAR_FEED_DEFAULTS.calname);
    expect(parse(`calname=${"x".repeat(CALNAME_MAX_LENGTH)}`).calname).toBe(
      "x".repeat(CALNAME_MAX_LENGTH),
    );
  });

  it("accepts only the two shapes of scope", () => {
    expect(parse("scope=family").scope).toBe("family");
    expect(parse(`scope=gamer:${GAMER}`).scope).toBe(`gamer:${GAMER}`);
    expect(parse("scope=gamer:not-a-uuid").scope).toBe("family");
  });
});

describe("calendar feed query building", () => {
  it("writes nothing when every option is at its default", () => {
    expect(calendarFeedQuery({ ...CALENDAR_FEED_DEFAULTS })).toBe("");
  });

  it("writes only what differs from the defaults", () => {
    const query = calendarFeedQuery({
      ...CALENDAR_FEED_DEFAULTS,
      mode: "rrule",
      alarm: "none",
    });
    expect(new URLSearchParams(query)).toEqual(
      new URLSearchParams("alarm=none&mode=rrule"),
    );
  });

  it("round-trips through the parser", () => {
    const options = {
      ...CALENDAR_FEED_DEFAULTS,
      tz: "tzid",
      weeks: "52",
      calname: "Aino & Väinö",
      scope: `gamer:${GAMER}`,
    } as const;
    expect(parse(calendarFeedQuery({ ...options }))).toEqual({ ...options });
  });
});

describe("calendar feed option accessors", () => {
  it("turns the alarm option into minutes, or none", () => {
    expect(alarmMinutes({ ...CALENDAR_FEED_DEFAULTS })).toBe(60);
    expect(alarmMinutes({ ...CALENDAR_FEED_DEFAULTS, alarm: "1440" })).toBe(1440);
    expect(alarmMinutes({ ...CALENDAR_FEED_DEFAULTS, alarm: "none" })).toBeNull();
  });

  it("turns the horizon option into a week count", () => {
    expect(horizonWeeks({ ...CALENDAR_FEED_DEFAULTS })).toBe(12);
    expect(horizonWeeks({ ...CALENDAR_FEED_DEFAULTS, weeks: "4" })).toBe(4);
  });

  it("turns the refresh option into a duration, or none", () => {
    expect(refreshDuration({ ...CALENDAR_FEED_DEFAULTS })).toBe("PT1H");
    expect(refreshDuration({ ...CALENDAR_FEED_DEFAULTS, refresh: "6h" })).toBe(
      "PT6H",
    );
    expect(
      refreshDuration({ ...CALENDAR_FEED_DEFAULTS, refresh: "off" }),
    ).toBeNull();
  });

  it("extracts the scoped participant, or null for the whole family", () => {
    expect(scopedParticipantId({ ...CALENDAR_FEED_DEFAULTS })).toBeNull();
    expect(
      scopedParticipantId({
        ...CALENDAR_FEED_DEFAULTS,
        scope: `gamer:${GAMER}`,
      }),
    ).toBe(GAMER);
  });
});
