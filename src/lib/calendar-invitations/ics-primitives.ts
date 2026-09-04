import { formatInTimeZone } from "date-fns-tz";

/**
 * The hard parts of RFC 5545, and nothing else.
 *
 * No dependency: the published builders are either large, or opinionated about
 * a data model we do not have, and the subset one invitation needs is a page of
 * code. What that page has to get right is the part every naive `.ics` writer
 * gets wrong — CRLF endings, **octet**-counted line folding, and TEXT escaping —
 * so those are what live here, tested on their own, while the document that
 * uses them is composition on top.
 *
 * **`VTIMEZONE` is a hand-written table, not a transition database.** Emitting a
 * correct block for an arbitrary IANA zone means shipping the whole of tzdata;
 * what is here instead is one block per zone the explorer offers, each written
 * from the rule the zone actually follows. Anything else still gets its `TZID`
 * reference plus a note saying no rules travel with it — clients generally
 * resolve a well-known TZID from their own database, so the reference alone is
 * usually enough, and *usually* is exactly why the note exists.
 */

export const ICS_PRODID = "-//School of Gaming//Sogverse//EN";

/** RFC 5545 §3.1: a content line is at most 75 **octets**, excluding the CRLF. */
const MAX_LINE_OCTETS = 75;

export const CRLF = "\r\n";

const encoder = new TextEncoder();

/**
 * Fold one content line to RFC 5545's 75-octet limit.
 *
 * Octets, not characters, and the difference is not academic: a Finnish or
 * Swedish product name is full of two-byte letters, so a fold counted in
 * characters silently emits lines a strict parser rejects. The walk is by
 * **code point** (`for…of` over a string), so a multi-byte sequence is never
 * split down the middle, and a continuation line's leading space is charged
 * against its own 75 because it is part of that line.
 */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= MAX_LINE_OCTETS) return line;

  const chunks: string[] = [];
  let current = "";
  let used = 0;
  // The first line spends all 75 octets on content; every continuation spends
  // one of them on the space that marks it as a continuation.
  let limit = MAX_LINE_OCTETS;

  for (const character of line) {
    const size = encoder.encode(character).length;
    if (used + size > limit) {
      chunks.push(current);
      current = "";
      used = 0;
      limit = MAX_LINE_OCTETS - 1;
    }
    current += character;
    used += size;
  }
  chunks.push(current);

  return chunks.join(`${CRLF} `);
}

/**
 * Escape a TEXT value per RFC 5545 §3.3.11. The backslash goes first or it
 * re-escapes the escapes the later replacements add.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** `YYYYMMDDTHHMMSSZ` — an absolute instant, the UTC form. */
export function formatUtcTimestamp(instant: Date): string {
  return formatInTimeZone(instant, "UTC", "yyyyMMdd'T'HHmmss'Z'");
}

/** A `NAME;PARAMS:VALUE` content line, folded. */
export function property(name: string, value: string, params = ""): string {
  return foldLine(`${name}${params}:${value}`);
}

/**
 * A parameter value, always a quoted-string.
 *
 * RFC 5545 §3.1 *requires* the quotes only around a value carrying `:`, `;` or
 * `,`, and quoting only those is what this did — until an iPhone reading a
 * Microsoft 365 mailbox displayed a bare `School of Gaming` as "School Gaming"
 * (2026-09-04). A parser is entitled to quote a param value whether or not it
 * has to, so the safe form is the one that never leaves a client guessing where
 * the value ends, and it costs two characters.
 *
 * A quoted-string cannot contain a DQUOTE at all — there is no escape for one —
 * so a double quote in a name is dropped rather than smuggled through. This is
 * the one place a name reaches the document *outside* a TEXT value, which is
 * why `escapeText` is not the answer here.
 */
export function paramValue(value: string): string {
  return `"${value.replace(/["\r\n]/g, "")}"`;
}

/**
 * UTC is not a zone a document has to describe.
 *
 * Its times are written in the absolute `…Z` form, which names no `TZID` and
 * therefore has nothing to resolve — so a document authored in UTC carries no
 * zone block and no note about one either. There is no gap to warn a reader
 * about when there is no reference to resolve.
 */
export const UTC_TIMEZONE = "UTC";

/** True for the zone whose times are written as absolute instants. */
export function isUtcZone(zone: string): boolean {
  return zone === UTC_TIMEZONE;
}

/**
 * One zone's transition rules, as the two subcomponents RFC 5545 asks for.
 *
 * Each half states the offset in force *before* it (`TZOFFSETFROM`), the offset
 * it switches to, the abbreviation a client may display, and the wall clock the
 * switch happens at — read in the offset that was in force before it, which is
 * what makes the two European rules differ in their `DTSTART`s while being the
 * same rule. The 1970 anchors are the convention every producer uses: each is a
 * date matching the rule in a year before the rule existed, and no client reads
 * them as history.
 */
interface ZoneRule {
  /** The offset in force before the switch, e.g. `+0200`. */
  from: string;
  /** The offset after it. */
  to: string;
  /** The abbreviation, e.g. `EEST`. */
  name: string;
  /** `YYYYMMDDTHHMMSS`, the local wall clock the switch happens at. */
  start: string;
  /** The `RRULE` that repeats it yearly. */
  rule: string;
}

/**
 * The zones this module can describe in full, and the rule each one follows.
 *
 * Four of the five are the **one** European rule seen from four offsets: the
 * switch happens at 01:00 UTC on the last Sunday of March and again on the last
 * Sunday of October, so each zone's local wall clock for it is 01:00 plus
 * whatever offset it is standing in at the time. That is why London switches at
 * 01:00 local, Paris and Stockholm at 02:00, and Helsinki at 03:00, and why the
 * autumn clock is one hour later in each — it is read in the summer offset.
 *
 * New York is the fifth and it is a genuinely different rule, which is the
 * point of having it here: the second Sunday of March and the first Sunday of
 * November, both at 02:00 *local*, so the two hemispherically-shaped ends of
 * the year land on dates no European zone shares. A document that only ever
 * described the EU rule could not show a client getting a US transition wrong.
 */
const ZONE_RULES: Record<string, [daylight: ZoneRule, standard: ZoneRule] | undefined> = {
  "Europe/Helsinki": [
    {
      from: "+0200",
      to: "+0300",
      name: "EEST",
      start: "19700329T030000",
      rule: "FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    },
    {
      from: "+0300",
      to: "+0200",
      name: "EET",
      start: "19701025T040000",
      rule: "FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    },
  ],
  "Europe/Stockholm": [
    {
      from: "+0100",
      to: "+0200",
      name: "CEST",
      start: "19700329T020000",
      rule: "FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    },
    {
      from: "+0200",
      to: "+0100",
      name: "CET",
      start: "19701025T030000",
      rule: "FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    },
  ],
  "Europe/Paris": [
    {
      from: "+0100",
      to: "+0200",
      name: "CEST",
      start: "19700329T020000",
      rule: "FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    },
    {
      from: "+0200",
      to: "+0100",
      name: "CET",
      start: "19701025T030000",
      rule: "FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    },
  ],
  "Europe/London": [
    {
      from: "+0000",
      to: "+0100",
      name: "BST",
      start: "19700329T010000",
      rule: "FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    },
    {
      from: "+0100",
      to: "+0000",
      name: "GMT",
      start: "19701025T020000",
      rule: "FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    },
  ],
  "America/New_York": [
    {
      from: "-0500",
      to: "-0400",
      name: "EDT",
      start: "19700308T020000",
      rule: "FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    },
    {
      from: "-0400",
      to: "-0500",
      name: "EST",
      start: "19701101T020000",
      rule: "FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    },
  ],
};

/**
 * Every zone the explorer offers: the five with rules, and UTC.
 *
 * Derived from the table rather than listed beside it, so a zone gains its form
 * field by gaining its transition rules and never the other way round — a
 * selectable zone with no block is the one combination that would put an
 * unexplained note in front of the reader.
 */
export const SUPPORTED_TIMEZONES: readonly string[] = [
  ...Object.keys(ZONE_RULES),
  UTC_TIMEZONE,
];

function ruleLines(kind: "DAYLIGHT" | "STANDARD", rule: ZoneRule): string[] {
  return [
    `BEGIN:${kind}`,
    `TZOFFSETFROM:${rule.from}`,
    `TZOFFSETTO:${rule.to}`,
    `TZNAME:${rule.name}`,
    `DTSTART:${rule.start}`,
    `RRULE:${rule.rule}`,
    `END:${kind}`,
  ];
}

/**
 * What a document says about the zone it names.
 *
 * Three answers, and the third is the one worth having. A zone with rules gets
 * them. UTC gets nothing, because its times are absolute instants and there is
 * no reference for a client to resolve. Anything else gets a note: a bare
 * `TZID` is legal and every mainstream client resolves it from its own
 * database, but a document that says nothing about the gap reads as one that
 * has no gap, and the reader comparing clients is exactly the person who needs
 * to know which case they are looking at.
 */
export function zoneBlock(zone: string): string[] {
  if (isUtcZone(zone)) return [];
  // The value type carries the `undefined` because `zone` is any string a
  // caller cares to hand over, so this lookup genuinely misses — a plain
  // `Record<string, T>` would claim otherwise and make the branch below read
  // as dead code.
  const rules = ZONE_RULES[zone];
  if (rules === undefined) {
    return [
      property(
        "X-SOGVERSE-NOTE",
        escapeText(
          `No VTIMEZONE is emitted for ${zone}: this build ships transition rules for ${Object.keys(
            ZONE_RULES,
          ).join(", ")} only, so the TZID reference relies on the client's own timezone database.`,
        ),
      ),
    ];
  }
  const [daylight, standard] = rules;
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${zone}`,
    `X-LIC-LOCATION:${zone}`,
    ...ruleLines("DAYLIGHT", daylight),
    ...ruleLines("STANDARD", standard),
    "END:VTIMEZONE",
  ];
}
