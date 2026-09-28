import { z } from "zod";
import { Constants } from "@/types";
// The same slot and location rows the municipality invoicing read emits, from
// the same SQL, so they are imported rather than spelled a second time.
import {
  municipalityInvoicingLocation,
  municipalityInvoicingMunicipality,
  municipalityInvoicingScheduleSlot,
} from "@/services/municipality-invoicing/municipality-invoicing.contracts";

/**
 * Runtime contract for the gedu invoicing document — what
 * `get_admin_gedu_invoicing` (every gedu) and `get_my_gedu_invoicing` (the
 * caller alone) both return, since both are thin wrappers over one internal
 * builder. The generated type is `Json`, so this schema is the structure,
 * written from the function body and parsed against real Postgres output by the
 * db test in CI.
 *
 * **The vocabulary is the database's**, as in the municipality contract: fees
 * in integer cents, calendar dates as bare product-local `YYYY-MM-DD` strings,
 * weekdays `0 = Monday … 6 = Sunday`, names as the whole
 * `product_translations` array.
 *
 * **Facts, not a verdict.** Whether a gedu was expected at a (group, date) is
 * the substitution derivation, and it has one TypeScript home
 * (`src/lib/session-staffing.ts`). The document carries exactly the seats that
 * derivation reads — the gedu's assignments, the substitutions they ran and
 * their own absences — and the builder runs it; nothing here pre-judges which
 * dates pay. Staffing is today's: assignments carry no history, so a past month
 * is read against current assignments.
 */

const productName = z.object({
  locale: z.string(),
  name: z.string(),
});

const geduRole = z.enum(Constants.public.Enums.gedu_assignment_role);

/** A standing seat: a group the gedu is assigned to today, and in which role. */
export const geduInvoicingAssignment = z.object({
  group_id: z.string(),
  role: geduRole,
});

/**
 * The other gedu on a substitution — the one absent, or the one who covered.
 * Named on both reads: a seated sub is staff on the group, to whom the absent
 * gedu is disclosed (`src/services/session-substitution/CLAUDE.md`). Why
 * anybody was away is never carried.
 */
export const geduInvoicingCounterpart = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
});

/**
 * A dated seat: a `substituted` request inside the month naming this gedu as
 * the sub. `role` is the one recorded on the request — the absent gedu's role
 * when it was filed — which is the role the sub is paid in.
 */
export const geduInvoicingSubstitution = z.object({
  request_id: z.string(),
  group_id: z.string(),
  session_date: z.string(),
  role: geduRole,
  /** The gedu this one stood in for — the request's requester. */
  absent_gedu: geduInvoicingCounterpart,
});

/**
 * One of the gedu's OWN live absences inside the month, on a group they hold a
 * seat on — the half of the derivation that takes them out of a session. Never
 * the reason.
 */
export const geduInvoicingAbsence = z.object({
  request_id: z.string(),
  group_id: z.string(),
  session_date: z.string(),
  role: geduRole,
  /** Never `withdrawn`: a withdrawn request is history and is not sent. */
  status: z.enum(["open", "substituted"]),
  /** The seated sub who covered, or null while the request is `open`. */
  substitute: geduInvoicingCounterpart.nullable(),
});

/**
 * One gedu with a seat in the month, and every seat they hold in it. Only this
 * entry carries an email — a counterpart is named, never addressed — and on the
 * gedu's own read it is the caller's own address.
 */
export const geduInvoicingGedu = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string(),
  assignments: z.array(geduInvoicingAssignment),
  substitutions: z.array(geduInvoicingSubstitution),
  absences: z.array(geduInvoicingAbsence),
});

/**
 * A group some gedu's seat touches, with its month of evidence.
 *
 * `sessions` are the stored `group_sessions` dates inside the month that no
 * cancellation in effect covers — the proof a session ran. `cancelled_sessions`
 * are the month's cancelled dates in effect, by the same predicate, so a date
 * is never in both and a cancelled date is never paid.
 */
export const geduInvoicingGroup = z.object({
  id: z.string(),
  product_id: z.string(),
  name: z.string(),
  sessions: z.array(z.string()),
  cancelled_sessions: z.array(z.string()),
});

/**
 * A product one of those groups belongs to: what projection needs (timezone,
 * term, weekly slots), what pays (both current fees — null means not set, never
 * zero), what splits the totals (`product_type`: a municipality club against
 * everything else), and what labels it (names, location, municipality — the
 * last null where the location chain reaches none, which a consumer club may).
 */
export const geduInvoicingProduct = z.object({
  id: z.string(),
  product_type: z.enum(Constants.public.Enums.product_type),
  timezone: z.string(),
  start_date: z.string(),
  end_date: z.string().nullable(),
  primary_gedu_fee_cents: z.number().nullable(),
  assistant_gedu_fee_cents: z.number().nullable(),
  product_translations: z.array(productName),
  schedule_slots: z.array(municipalityInvoicingScheduleSlot),
  location: municipalityInvoicingLocation.nullable(),
  municipality: municipalityInvoicingMunicipality.nullable(),
});

/** The whole document both gedu invoicing reads return. */
export const geduInvoicingSnapshot = z.object({
  /** The first day of the month the document covers, `YYYY-MM-01`. */
  month_start: z.string(),
  /** On the gedu's own read, the caller alone — or nobody, for an empty month. */
  gedus: z.array(geduInvoicingGedu),
  groups: z.array(geduInvoicingGroup),
  products: z.array(geduInvoicingProduct),
});

export type GeduInvoicingCounterpart = z.infer<
  typeof geduInvoicingCounterpart
>;
export type GeduInvoicingAssignment = z.infer<typeof geduInvoicingAssignment>;
export type GeduInvoicingSubstitution = z.infer<
  typeof geduInvoicingSubstitution
>;
export type GeduInvoicingAbsence = z.infer<typeof geduInvoicingAbsence>;
export type GeduInvoicingGedu = z.infer<typeof geduInvoicingGedu>;
export type GeduInvoicingGroup = z.infer<typeof geduInvoicingGroup>;
export type GeduInvoicingProduct = z.infer<typeof geduInvoicingProduct>;
export type GeduInvoicingSnapshot = z.infer<typeof geduInvoicingSnapshot>;
