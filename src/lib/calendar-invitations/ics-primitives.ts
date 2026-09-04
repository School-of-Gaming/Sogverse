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
 * The one deliberate limit is `VTIMEZONE`: generating a correct one for an
 * arbitrary IANA zone means shipping a transition database, so this module
 * knows `Europe/Helsinki` — which is where every product we run is authored —
 * and for anything else emits the `TZID` reference alone plus a note saying so.
 * Clients generally resolve a well-known TZID from their own database, so the
 * reference on its own is usually enough; it is a *usually*, which is exactly
 * why the note exists.
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

/** `YYYYMMDDTHHMMSS` — the wall clock the instant shows in `timeZone`. */
export function formatZonedTimestamp(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "yyyyMMdd'T'HHmmss");
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

/** The zone this module can describe fully. Every product we run is in it. */
export const KNOWN_TIMEZONE = "Europe/Helsinki";

/**
 * `Europe/Helsinki` under the EU rule: EET (+02:00) in winter, EEST (+03:00)
 * from the last Sunday of March at 03:00 local to the last Sunday of October at
 * 04:00 local — both of which are 01:00 UTC, which is what makes them one rule
 * rather than two. The 1970 `DTSTART`s are the conventional anchors: each is a
 * last Sunday of its month, stated in the offset in force *before* its own
 * transition.
 */
export const HELSINKI_VTIMEZONE: readonly string[] = [
  "BEGIN:VTIMEZONE",
  `TZID:${KNOWN_TIMEZONE}`,
  `X-LIC-LOCATION:${KNOWN_TIMEZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0300",
  "TZNAME:EEST",
  "DTSTART:19700329T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0300",
  "TZOFFSETTO:+0200",
  "TZNAME:EET",
  "DTSTART:19701025T040000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

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
 * What a document says about a zone it names but cannot describe.
 *
 * A `TZID` with no transition rules beside it is legal and every mainstream
 * client resolves it from its own database — but a document that says nothing
 * about the gap reads as one that has no gap, and the reader comparing clients
 * is exactly the person who needs to know which case they are looking at.
 */
export function zoneBlock(zone: string): string[] {
  if (isUtcZone(zone)) return [];
  if (zone === KNOWN_TIMEZONE) return [...HELSINKI_VTIMEZONE];
  return [
    property(
      "X-SOGVERSE-NOTE",
      escapeText(
        `No VTIMEZONE is emitted for ${zone}: this build ships transition rules for ${KNOWN_TIMEZONE} only, so the TZID reference relies on the client's own timezone database.`,
      ),
    ),
  ];
}
