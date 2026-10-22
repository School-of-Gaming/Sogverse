import { formattingLocale } from "@/lib/constants/locales";

// `locale` and `timeZone` are both required: a time-of-day always renders in
// an explicit viewer zone, never the runtime default (CLAUDE.md viewer-zone
// rule). The required `timeZone` is the type-level enforcement of that rule —
// the compiler rejects a call that omits it, no lint heuristic needed.
//
// The `locale` taken by every helper below is the app locale; each resolves it
// through `formattingLocale()` itself, so callers never pass an `Intl` tag.
const TIME_OF_DAY: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

export function formatTime(date: Date | string, locale: string, timeZone: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(formattingLocale(locale), { ...TIME_OF_DAY, timeZone }).format(d);
}

/** A thin or narrow no-break space directly before or after a range's en dash. */
const RANGE_DASH_SPACE = /[\u2009\u202f](?=\u2013)|(?<=\u2013)[\u2009\u202f]/g;

/**
 * A start–end range — one session's clock face — in the given zone, with the
 * zone's short name appended ("16:30–18:00 EEST"). Both ends are formatted
 * from their own instants: the end is never a duration string-added to the
 * local start, which a DST transition inside the session would corrupt
 * (CLAUDE.md viewer-zone rule).
 *
 * The zone is always named because this is what goes into a mail, and a mail
 * is rendered without the reader's zone: the app can label a time in the
 * viewer's own zone and omit the name when nothing was adjusted, but a mail can
 * only use the product's zone, and the reader has to be able to see which zone
 * that is.
 *
 * The space either side of the dash is rewritten to a plain one. Which space
 * `formatRange` sets there is a property of the runtime's locale data — newer
 * data sets a thin space, older a plain one — and the server and the browser
 * do not carry the same data, so a range rendered on both sides of a hydration
 * would otherwise differ by a character nobody can see. Only the spaces touching
 * the dash are rewritten, so a locale that sets none still gets none.
 */
export function formatTimeRange(
  start: Date | string,
  end: Date | string,
  locale: string,
  timeZone: string,
): string {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  return new Intl.DateTimeFormat(formattingLocale(locale), {
    ...TIME_OF_DAY,
    timeZone,
    timeZoneName: "short",
  })
    .formatRange(s, e)
    .replace(RANGE_DASH_SPACE, " ");
}

// `options` is required and must carry a `timeZone`: an instant always renders
// in an explicit viewer zone (CLAUDE.md viewer-zone rule), enforced by the
// type so a call can't silently fall back to the runtime default. A genuinely
// zoneless calendar date uses `formatDateOnly` instead (which UTC-pins it).
export function formatDate(
  date: Date | string,
  locale: string,
  options: Intl.DateTimeFormatOptions & { timeZone: string },
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(formattingLocale(locale), options).format(d);
}

/**
 * Format a date-only string ("YYYY-MM-DD") — a calendar date carrying no time
 * or zone (a product start/end date, a weekday label, etc.).
 *
 * Use this, not `formatDate`, whenever the input is a bare date. The whole job
 * here is to render that date as itself, identically, everywhere — so it is
 * pinned to UTC at both ends: parsed as UTC midnight and rendered with
 * `timeZone: "UTC"`. That removes three failure modes we've been bitten by:
 *   - **Hydration mismatch** — the server renders in UTC and the client in the
 *     browser's zone; without a fixed zone the date portion can differ between
 *     the two passes. UTC on both sides makes them byte-identical.
 *   - **Offset tipping** — `formatDate` parses the string as UTC midnight and
 *     renders in the runtime zone, slipping a day for negative-offset viewers;
 *     a noon anchor instead slips for extreme positive offsets (UTC+13/+14).
 *     Rendering in UTC can't tip in either direction.
 *   - **DST** — UTC has no daylight saving, so no boundary surprises.
 * `timeZone: "UTC"` is forced last so a caller can't reintroduce zone drift for
 * what is, by definition, a zoneless date. Pass `options` for a non-default
 * render (e.g. `{ weekday: "long" }` for the weekday name).
 */
export function formatDateOnly(date: string, locale: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(formattingLocale(locale), {
    ...(options ?? { dateStyle: "medium" }),
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * A zoneless calendar date range from two ISO dates, en-dash separated
 * ("13 Jan – 30 May 2026"). Shared by the consumers that build a range straight
 * from start/end ISO columns (club term dates, the admin product rows) so the
 * separator + single-date collapse live in one place. A missing end, or an end
 * equal to the start, renders as just the one date rather than a degenerate
 * "X – X". Both dates go through `formatDateOnly`, so they stay UTC-pinned (per
 * CLAUDE.md "Date & Time").
 */
export function formatDateRange(
  startDate: string,
  endDate: string | null,
  locale: string,
): string {
  if (endDate && endDate !== startDate) {
    return `${formatDateOnly(startDate, locale)} – ${formatDateOnly(endDate, locale)}`;
  }
  return formatDateOnly(startDate, locale);
}

/**
 * A short zoneless range from two ISO dates, both inclusive — "13–17 Oct",
 * "13 Oct – 17 Nov", "22 Dec 2026 – 6 Jan 2027" — for a run of days read
 * beside other dates rather than as a headline: a holiday break in a list or a
 * feed. `Intl.DateTimeFormat#formatRange` writes the compact forms itself, so
 * each locale collapses the shared month and year its own way. One day names
 * one date.
 *
 * **The year appears only where the reader needs it**: a range that crosses a
 * year boundary always carries it (the formatter adds it unasked), and a range
 * inside a single year carries it when that year is not the one `today` falls
 * in. `today` is the caller's `YYYY-MM-DD`, from the same request-stable clock
 * as the rest of the page, so the server and the first client render agree.
 *
 * UTC-pinned like `formatDateOnly`. **The space either side of the dash is
 * decided here, not taken from `Intl`**: the dash is spaced exactly when either
 * end holds a space of its own ("13 Oct – 17 Nov", "19–23 Oct"). CLDR moves
 * that spacing between releases — CLDR 48 spaced English's same-month range and
 * unspaced Swedish's cross-month one — so taking it from the runtime would make
 * the server's Node and the reader's browser disagree, and the hydration
 * mismatch `formatTimeRange` normalises away would come back as a whole space.
 */
export function formatCompactDateRange(
  startDate: string,
  endDate: string,
  locale: string,
  today: string,
): string {
  const startYear = startDate.slice(0, 4);
  const showYear =
    startYear !== endDate.slice(0, 4) || startYear !== today.slice(0, 4);
  const format = new Intl.DateTimeFormat(formattingLocale(locale), {
    day: "numeric",
    month: "short",
    ...(showYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
  const start = new Date(`${startDate}T00:00:00Z`);
  if (endDate <= startDate) return format.format(start);
  const parts = format.formatRangeToParts(start, new Date(`${endDate}T00:00:00Z`));
  const endHoldsSpace = parts.some(
    (part) => part.source !== "shared" && part.type === "literal" && /\s/.test(part.value),
  );
  const dash = endHoldsSpace ? " – " : "–";
  return parts
    .map((part) =>
      part.source === "shared" && part.value.includes("–") ? part.value.replace(/\s*–\s*/, dash) : part.value,
    )
    .join("");
}
