import { formatDate, formatTime } from "@/lib/utils";

/**
 * Localized "next session at" line — short weekday + day + long month +
 * 24h start–end time range. Abbreviating just the weekday is enough to
 * fit a Finnish long-form on a single row of the narrow column layout
 * ("lauantai" → "la"); the month word stays long since "toukokuuta"
 * reads naturally and most other locales keep month words short anyway.
 * `formatTime` normalizes the time column to 24h regardless of locale
 * default.
 *
 * Start and end are formatted separately rather than via `formatRange`:
 * when a session crosses midnight (start and end on different calendar
 * days), `formatRange` auto-promotes to "5/15/2026, 19:45 – 5/16/2026,
 * 01:45" to disambiguate. The card always pairs this label with its
 * own date anchor that already tells the reader which day we mean, so
 * the bare time range reads correctly.
 *
 *   en → "Mon, May 1 · 16:00 – 18:00"
 *   fi → "ma 1. toukokuuta · 16.00 – 18.00"
 *   sv → "mån 1 maj · 16:00 – 18:00"
 */
export function formatSessionDateTimeRange(
  start: Date,
  end: Date,
  locale: string,
  timeZone: string,
): string {
  const datePart = formatDate(start, locale, {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone,
  });
  return `${datePart} · ${formatTime(start, locale, timeZone)} – ${formatTime(end, locale, timeZone)}`;
}

/**
 * Compound countdown formatter. Shows the two largest non-empty units so
 * the countdown reads naturally as the session approaches:
 *
 *   ≥1 day → "2 days, 5 hours"
 *   ≥1 hour <1 day → "8 hours, 12 minutes"
 *   <1 hour → "37 minutes"
 *
 * Drops the secondary unit when it's zero so we don't show "2 days, 0
 * hours". Stops at the minute — sub-minute precision adds noise without
 * value. Caller decides what to render when `ms <= 0` (typically a
 * separate "in progress" string).
 */
export function formatCountdownCompound(ms: number, locale: string): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;

  const unit = (value: number, u: "day" | "hour" | "minute"): string =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: u,
      unitDisplay: "long",
    }).format(value);

  const list = new Intl.ListFormat(locale, { type: "unit", style: "narrow" });

  if (days > 0) {
    return hours > 0
      ? list.format([unit(days, "day"), unit(hours, "hour")])
      : unit(days, "day");
  }
  if (hours > 0) {
    return minutes > 0
      ? list.format([unit(hours, "hour"), unit(minutes, "minute")])
      : unit(hours, "hour");
  }
  return unit(minutes, "minute");
}
