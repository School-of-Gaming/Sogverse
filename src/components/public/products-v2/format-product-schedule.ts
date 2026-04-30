import type { ProductV2BrowseRow } from "@/types";

// Schedule formatting for the browse + purchased cards.
//
// Returns a discriminated union the card layer maps onto the
// `productBrowse.card.schedule*` i18n keys. Centralising the math here
// keeps the card render branchless beyond a single `kind` switch.
//
// Per CLAUDE.md "Date & Time Formatting", we use Intl APIs for output and
// reach for date-fns-tz only for timezone-aware computation. Times are
// stored as Postgres TIME ("HH:MM:SS") in the product's local timezone
// (see redesign §4.3) — they don't need conversion to render the clock
// face. Just slice off the seconds.

export type ProductScheduleLine =
  | { kind: "every"; day: string; time: string; tz: string | null }
  | {
      kind: "range";
      startDate: string;
      endDate: string;
      tz: string | null;
    }
  | { kind: "single"; date: string; time: string; tz: string | null }
  | { kind: "tbd" };

export interface FormatScheduleArgs {
  product: Pick<
    ProductV2BrowseRow,
    "product_type" | "start_date" | "end_date" | "timezone" | "schedule_slots_v2"
  >;
  locale: string;
}

// Schema labels Monday as 0 (per redesign §5.1: "0=Mon..6=Sun"). Seed a
// known Monday so adding `weekday` directly walks forward through the
// week, then ask Intl to render the day name in the user's locale.
const WEEKDAY_SEED = new Date(Date.UTC(2024, 0, 1)); // a Monday

export function formatWeekday(weekday: number, locale: string): string {
  const d = new Date(WEEKDAY_SEED);
  d.setUTCDate(WEEKDAY_SEED.getUTCDate() + weekday);
  return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(d);
}

function formatClockTime(time: string): string {
  // Postgres TIME comes back as "HH:MM:SS"; strip seconds for display.
  return time.slice(0, 5);
}

function formatDateOnly(date: string, locale: string): string {
  // Date-only string. Anchor to UTC noon so locale rendering doesn't tip
  // it into the previous day for negative-offset zones.
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

export function formatTimezoneShort(tz: string, locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

export function formatProductSchedule({
  product,
  locale,
}: FormatScheduleArgs): ProductScheduleLine {
  const tz = formatTimezoneShort(product.timezone, locale);
  const slots = product.schedule_slots_v2;

  switch (product.product_type) {
    case "consumer_club":
    case "municipality_club": {
      if (slots.length === 0) return { kind: "tbd" };
      // Show the first weekday in the week (our weekday is 0=Mon..6=Sun,
      // so a numeric sort already gives that). For multi-day clubs the
      // detail page (out of scope this pass) will surface the full set.
      const slot = [...slots].sort((a, b) => a.weekday - b.weekday)[0];
      return {
        kind: "every",
        day: formatWeekday(slot.weekday, locale),
        time: formatClockTime(slot.start_time),
        tz,
      };
    }
    case "camp": {
      if (!product.start_date || !product.end_date) return { kind: "tbd" };
      return {
        kind: "range",
        startDate: formatDateOnly(product.start_date, locale),
        endDate: formatDateOnly(product.end_date, locale),
        tz,
      };
    }
    case "event": {
      if (!product.start_date) return { kind: "tbd" };
      const time = slots.length > 0 ? formatClockTime(slots[0].start_time) : "";
      return {
        kind: "single",
        date: formatDateOnly(product.start_date, locale),
        time,
        tz,
      };
    }
  }
}
