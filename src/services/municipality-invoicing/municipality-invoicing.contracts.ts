import { z } from "zod";
import { Constants } from "@/types";
// The one definition of a Fennoa customer, imported rather than restated: the
// RPC emits the stored row, so a second spelling of those nine fields here
// would be a second thing to keep in step with the table and with the
// serializer that reads them.
import { invoiceCustomerRow } from "@/services/invoice-customers/invoice-customers.contracts";

/**
 * Runtime contract for `get_admin_municipality_invoicing`, the single JSONB
 * document behind the municipality invoicing page. The generated type is
 * `Json`, so this schema is the structure — written from the RPC body in the
 * migration that created it, and parsed against real Postgres output by the db
 * test in CI, which is what keeps the two honest.
 *
 * **The vocabulary is the database's**, deliberately: `municipality_fee_cents`
 * in integer cents, calendar dates as bare `YYYY-MM-DD` strings, weekdays as
 * `0 = Monday … 6 = Sunday` exactly as `schedule_slots.weekday` stores them, a
 * product's names as the whole `product_translations` array. The page renames
 * what it renders; a wire shape that renamed them first would only have to be
 * translated back to be checked against the function.
 *
 * **Everything here is a fact, not a view.** No totalling happens on the wire:
 * the month's arithmetic — which dates a club's schedule projects, which of
 * them a stored row already covers, how many sessions that is and what they
 * come to — is the invoice itself, and it belongs in one pure function the
 * tests can drive, not split across a query and a component.
 */

/** One product name, in one locale. */
const productName = z.object({
  locale: z.string(),
  name: z.string(),
});

/** One recurring session slot, in the product's own timezone. */
export const municipalityInvoicingScheduleSlot = z.object({
  /** 0 = Monday … 6 = Sunday, matching `schedule_slots.weekday`. */
  weekday: z.number(),
  /** `HH:MM` wall clock in the product's zone. */
  start_time: z.string(),
  duration_minutes: z.number(),
});

/**
 * A club's own location row — the school hall it meets in, or the municipality
 * itself for an online club. `name_i18n` is the locale → name override map the
 * shared location-name resolver reads, spelled the same way every other
 * location contract in this app spells it.
 */
export const municipalityInvoicingLocation = z.object({
  id: z.string(),
  name: z.string(),
  name_i18n: z.record(z.string(), z.string()).nullable(),
  type: z.enum(Constants.public.Enums.location_type),
});

/**
 * The municipality a club is invoiced to: the nearest ancestor-or-self of type
 * `municipality` above its own location.
 *
 * **Always present.** A municipality club whose location chain reaches no
 * municipality is a club nobody can be billed for, and the function refuses the
 * whole month rather than shipping it — so there is no "no municipality" answer
 * to parse here and no bucket for one anywhere above. The state is a data error
 * to repair at its source, not a shape this page has to render.
 */
export const municipalityInvoicingMunicipality = z.object({
  id: z.string(),
  name: z.string(),
  name_i18n: z.record(z.string(), z.string()).nullable(),
});

/**
 * One stored session row, raw: which group met, and on which product-local
 * calendar date.
 *
 * Rows arrive one per (group, date) because that is the table's own key. A club
 * running two groups that both met on the 12th sends two rows for one session —
 * the collapse is a rule of the *invoice*, not of the data, and doing it here
 * would have thrown away which groups were there.
 */
export const municipalityInvoicingSession = z.object({
  group_id: z.string(),
  /** `YYYY-MM-DD`, the product-local date the session record is keyed to. */
  session_date: z.string(),
});

/**
 * One municipality club the month has something to say about: either it
 * recorded a session, or its term overlapped the month at all. The term is the
 * whole of that second test — there is no status on the wire and none in the
 * database to ask about.
 *
 * `municipality_fee_cents` is the product's *current* fee, read at page load
 * with no snapshotting, and null means the field has never been filled in. Null
 * is never worth zero: a club with no fee is excluded from its municipality's
 * total and named as something to fix.
 *
 * `invoice_customer` is the Fennoa customer this club is billed to, whole
 * rather than by id — the caller turns it into a Finvoice file, so a second
 * admin-gated round trip per club would buy nothing. **Nullable, and unlike a
 * missing municipality it does not refuse the month**: a club nobody has named
 * a buyer for renders on the page perfectly well and only its own file is
 * blocked, so refusing would take every other file down with it. The link is
 * the club's own and is never derived from its location — one city can be two
 * customers, and an association can buy clubs sited in a municipality it is not.
 */
export const municipalityInvoicingClub = z.object({
  id: z.string(),
  timezone: z.string(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  municipality_fee_cents: z.number().nullable(),
  product_translations: z.array(productName),
  schedule_slots: z.array(municipalityInvoicingScheduleSlot),
  location: municipalityInvoicingLocation.nullable(),
  municipality: municipalityInvoicingMunicipality,
  invoice_customer: invoiceCustomerRow.nullable(),
  sessions: z.array(municipalityInvoicingSession),
});

/** The whole document `get_admin_municipality_invoicing` returns. */
export const municipalityInvoicingSnapshot = z.object({
  /** The first day of the month the document covers, `YYYY-MM-01`. */
  month_start: z.string(),
  clubs: z.array(municipalityInvoicingClub),
});

/**
 * The compile-time shapes, derived from the schemas above so the wire contract
 * and the types can't drift.
 */
export type MunicipalityInvoicingScheduleSlot = z.infer<
  typeof municipalityInvoicingScheduleSlot
>;
export type MunicipalityInvoicingLocation = z.infer<
  typeof municipalityInvoicingLocation
>;
export type MunicipalityInvoicingMunicipality = z.infer<
  typeof municipalityInvoicingMunicipality
>;
export type MunicipalityInvoicingSession = z.infer<
  typeof municipalityInvoicingSession
>;
export type MunicipalityInvoicingClub = z.infer<
  typeof municipalityInvoicingClub
>;
export type MunicipalityInvoicingSnapshot = z.infer<
  typeof municipalityInvoicingSnapshot
>;
