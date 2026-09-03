import { z } from "zod";

/**
 * The knobs the calendar feed exposes, as query-string parameters on the feed
 * URL itself.
 *
 * They are on the URL rather than in a stored preference because the whole
 * point of the exploration is to compare them: an owner subscribes Apple
 * Calendar to one URL and Google to another and looks at what each client
 * actually does with `VALARM`, with an `RRULE`, with a `TZID`. A stored
 * preference would make that a two-account experiment.
 *
 * **Every parameter falls back to its default rather than answering 400.** A
 * calendar app stores the URL it was given and re-fetches it forever, so a
 * value we later stop recognising must keep the subscription working — the feed
 * degrades to the default rather than going dark in an app the parent cannot
 * see the error in.
 */

export const ALARM_VALUES = ["none", "15", "60", "1440"] as const;
export const TITLE_VALUES = ["product", "product-gamer", "gamer-product"] as const;
export const MODE_VALUES = ["discrete", "rrule"] as const;
export const TZ_VALUES = ["utc", "tzid"] as const;
export const WEEKS_VALUES = ["4", "8", "12", "26", "52"] as const;
export const COLOR_VALUES = ["on", "off"] as const;
export const REFRESH_VALUES = ["off", "1h", "6h", "24h"] as const;
export const DETAILS_VALUES = ["none", "basic", "full"] as const;
export const BUSY_VALUES = ["busy", "free"] as const;
export const METHOD_VALUES = ["publish", "none"] as const;

/** How long a calendar name may be before the parameter is ignored. */
export const CALNAME_MAX_LENGTH = 60;

/**
 * The calendar's default name.
 *
 * The brand, not the platform: a subscribed calendar's name is met **cold**, in
 * a sidebar list beside "Work" and "Family", by a parent who may never have
 * typed the platform's name. That is exactly the position the brand rule
 * reserves for "School of Gaming".
 */
export const DEFAULT_CALENDAR_NAME = "School of Gaming";

export const CALENDAR_FEED_DEFAULTS = {
  alarm: "60",
  title: "product-gamer",
  mode: "discrete",
  tz: "utc",
  weeks: "12",
  scope: "family",
  calname: DEFAULT_CALENDAR_NAME,
  color: "on",
  refresh: "1h",
  details: "basic",
  busy: "free",
  method: "publish",
} as const;

/**
 * `family`, or `gamer:<participant uuid>`.
 *
 * A filter only ever narrows: the token already fixes whose family the feed is
 * about, and this can only pick one seat-holder out of it. A malformed or
 * unknown participant therefore falls back to the whole family rather than to
 * an empty calendar — the failure mode of a stale bookmark should be "too much"
 * rather than "silently nothing".
 */
const GAMER_SCOPE = /^gamer:[0-9a-fA-F-]{36}$/;

export const calendarFeedOptionsSchema = z.object({
  alarm: z.enum(ALARM_VALUES).catch(CALENDAR_FEED_DEFAULTS.alarm),
  title: z.enum(TITLE_VALUES).catch(CALENDAR_FEED_DEFAULTS.title),
  mode: z.enum(MODE_VALUES).catch(CALENDAR_FEED_DEFAULTS.mode),
  tz: z.enum(TZ_VALUES).catch(CALENDAR_FEED_DEFAULTS.tz),
  weeks: z.enum(WEEKS_VALUES).catch(CALENDAR_FEED_DEFAULTS.weeks),
  scope: z
    .string()
    .refine((value) => value === "family" || GAMER_SCOPE.test(value))
    .catch(CALENDAR_FEED_DEFAULTS.scope),
  calname: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(CALNAME_MAX_LENGTH))
    .catch(CALENDAR_FEED_DEFAULTS.calname),
  color: z.enum(COLOR_VALUES).catch(CALENDAR_FEED_DEFAULTS.color),
  refresh: z.enum(REFRESH_VALUES).catch(CALENDAR_FEED_DEFAULTS.refresh),
  details: z.enum(DETAILS_VALUES).catch(CALENDAR_FEED_DEFAULTS.details),
  busy: z.enum(BUSY_VALUES).catch(CALENDAR_FEED_DEFAULTS.busy),
  /**
   * Whether the document states `METHOD:PUBLISH`.
   *
   * A knob rather than a constant because clients disagree about what the
   * property means for a *subscription*: it is what an iTIP message uses to say
   * what it is doing, and a subscribed calendar is not an iTIP message, so some
   * readers treat a document carrying it as an invitation rather than a feed.
   * Which of them do is the kind of thing this exploration exists to find out by
   * subscribing two URLs and looking.
   */
  method: z.enum(METHOD_VALUES).catch(CALENDAR_FEED_DEFAULTS.method),
});

export type CalendarFeedOptions = z.infer<typeof calendarFeedOptionsSchema>;

/**
 * Every option key, as a value a loop can walk.
 *
 * `satisfies` rather than an annotation, so the list is checked against the
 * schema's own shape — a key added to the schema and forgotten here would leave
 * that option silently absent from every URL the card builds.
 */
export const CALENDAR_FEED_OPTION_KEYS = [
  "alarm",
  "title",
  "mode",
  "tz",
  "weeks",
  "scope",
  "calname",
  "color",
  "refresh",
  "details",
  "busy",
  "method",
] as const satisfies readonly (keyof CalendarFeedOptions)[];

/**
 * Read the options off a URL's query string. Never throws: every field carries
 * its own `.catch`, and the object schema is fed a plain record so a missing
 * key is `undefined`, which fails its field schema and lands on the default.
 */
export function parseCalendarFeedOptions(
  params: URLSearchParams,
): CalendarFeedOptions {
  return calendarFeedOptionsSchema.parse(Object.fromEntries(params.entries()));
}

/**
 * The non-default half of a set of options, as a query string.
 *
 * Only what differs from the defaults is written, so the plain feed URL — the
 * one an owner is most likely to paste somewhere — carries no query string at
 * all, and a URL that *does* carry one says exactly what is unusual about it.
 */
export function calendarFeedQuery(options: CalendarFeedOptions): string {
  const params = new URLSearchParams();
  for (const key of CALENDAR_FEED_OPTION_KEYS) {
    if (options[key] !== CALENDAR_FEED_DEFAULTS[key]) {
      params.set(key, options[key]);
    }
  }
  return params.toString();
}

/** Minutes before the start the single `VALARM` fires, or `null` for none. */
export function alarmMinutes(options: CalendarFeedOptions): number | null {
  return options.alarm === "none" ? null : Number(options.alarm);
}

/** How many weeks ahead discrete mode enumerates. */
export function horizonWeeks(options: CalendarFeedOptions): number {
  return Number(options.weeks);
}

/** The `REFRESH-INTERVAL` / `X-PUBLISHED-TTL` duration, or `null` for none. */
export function refreshDuration(options: CalendarFeedOptions): string | null {
  switch (options.refresh) {
    case "off":
      return null;
    case "1h":
      return "PT1H";
    case "6h":
      return "PT6H";
    case "24h":
      return "PT24H";
  }
}

/** The participant the feed is narrowed to, or `null` for the whole family. */
export function scopedParticipantId(
  options: CalendarFeedOptions,
): string | null {
  return options.scope === "family" ? null : options.scope.slice("gamer:".length);
}
