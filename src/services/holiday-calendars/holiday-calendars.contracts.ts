import { z } from "zod";
import { Constants } from "@/types";
import { plannedSessionRow } from "@/lib/planned-sessions";

/**
 * Wire contracts for holiday calendars — the named lists of breaks a club
 * follows, and what saving one would change.
 *
 * The functions behind these return `jsonb` or take it, which the type
 * generator sees only as `Json`, so the schemas here are the structure. They
 * are written from the function bodies, and the db tests parse real RPC output
 * through these same schemas.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One authored name: a break's in one locale, or a product's. */
const localeName = z.object({ locale: z.string(), name: z.string() }).strict();

/**
 * One break as the calendar writers and the preview take it. `id` is the
 * stored break being kept or edited, `null` for a new one; a stored break the
 * payload leaves out is deleted. Dates are bare calendar dates, both
 * inclusive, read in each club's own zone.
 */
export const holidayBreakInput = z
  .object({
    id: z.string().nullable(),
    start_date: isoDate,
    end_date: isoDate,
    names: z.array(localeName),
  })
  .strict();

export type HolidayBreakInput = z.infer<typeof holidayBreakInput>;

/**
 * A stored record on a date whose holiday standing flips: `hidden` when the
 * date becomes a holiday, `shown` again when it stops being one.
 */
const affectedRecord = z
  .object({
    group_id: z.string(),
    group_name: z.string(),
    session_date: isoDate,
    effect: z.enum(["hidden", "shown"]),
  })
  .strict()
  .transform((row) => ({
    groupId: row.group_id,
    groupName: row.group_name,
    date: row.session_date,
    effect: row.effect,
  }));

/**
 * A substitution request that is not withdrawn, on a date whose holiday
 * standing flips: `no_session` when the date becomes a holiday, `reopened`
 * when it stops being one.
 */
const affectedRequest = z
  .object({
    request_id: z.string(),
    group_id: z.string(),
    group_name: z.string(),
    session_date: isoDate,
    status: z.enum(Constants.public.Enums.substitution_request_status),
    effect: z.enum(["no_session", "reopened"]),
  })
  .strict()
  .transform((row) => ({
    requestId: row.request_id,
    groupId: row.group_id,
    groupName: row.group_name,
    date: row.session_date,
    status: row.status,
    effect: row.effect,
  }));

/**
 * What saving the calendar would change for one club that follows it. Only a
 * club where something changes is listed. `removed` and `restored` are planned
 * sessions, past and future alike, soonest first; `today` is the club's own
 * local date, for telling the two apart.
 */
const holidayChangeProduct = z
  .object({
    product_id: z.string(),
    product_type: z.enum(Constants.public.Enums.product_type),
    timezone: z.string(),
    today: isoDate,
    /** Every locale written; which one to read is the reader's. */
    translations: z.array(localeName),
    removed: z.array(plannedSessionRow),
    restored: z.array(plannedSessionRow),
    records: z.array(affectedRecord),
    requests: z.array(affectedRequest),
  })
  .strict()
  .transform((row) => ({
    productId: row.product_id,
    productType: row.product_type,
    timezone: row.timezone,
    today: row.today,
    translations: row.translations,
    removed: row.removed,
    restored: row.restored,
    records: row.records,
    requests: row.requests,
  }));

/** `preview_holiday_calendar_change`'s answer. */
export const holidayCalendarChangePreview = z
  .object({ products: z.array(holidayChangeProduct) })
  .strict();

export type HolidayCalendarChangePreview = z.output<typeof holidayCalendarChangePreview>;

/**
 * What the calendar writers take: the admin-only name, and the calendar's
 * whole set of breaks afterwards. The name is trimmed here so what reaches the
 * function is what it stores; every other rule — a blank or taken name, a break
 * ending before it begins, two breaks overlapping, a blank name — is the
 * function's, refused with a sentence written to be shown as it is.
 */
export const holidayCalendarInput = z
  .object({
    name: z.string().trim().min(1),
    breaks: z.array(holidayBreakInput),
  })
  .strict();

export type HolidayCalendarInput = z.input<typeof holidayCalendarInput>;
