import { wrapInLayout } from "./layout";
import { ctaButton, factTable } from "./blocks";
import { defuseAutolinks, escapeHtml, heading, paragraph } from "./utils";
import type { EmailTranslator } from "./translator";

/**
 * Why the seat is free again. Two ways an offer ends without a seat being
 * taken, and they are one builder rather than two because the mail is the same
 * mail: the same facts, the same next step, one sentence different.
 *
 * Keeping them together is also what keeps them honest — a variant nobody can
 * send from `/admin/testing` is a variant nobody checks, and the registry
 * exposes this one as a select.
 */
export const SEAT_OFFER_STAFF_REASONS = ["declined", "no_response"] as const;

export type SeatOfferStaffReason = (typeof SEAT_OFFER_STAFF_REASONS)[number];

export interface SeatOfferStaffEmailOptions {
  reason: SeatOfferStaffReason;
  /** The person who holds the queued place — a child, or an adult on their own seat. */
  participantName: string;
  /** The contact behind the seat: the parent, or the adult themselves. */
  contactName: string;
  /** Their address, displayed and never linked — see the note at the call site. */
  contactEmail: string;
  productName: string;
  /**
   * How to recognise the run being talked about — the weekly schedule sentence,
   * already formatted, or null on a product with no slots. An admin reading
   * this at speed needs to know *which* Tuesday club lost a family before they
   * click anything.
   */
  productSchedule: string | null;
  /** When the offer went out, already formatted with its zone named. */
  offeredAt: string;
  /** Deep link to the product's admin page, where the next family is invited. */
  adminProductUrl: string;
}

/**
 * The staff mail that turns one family's answer into the next family's
 * invitation.
 *
 * It goes to **every admin account**, resolved at send time from the role
 * column — the same recipient list the feedback notification uses, and for the
 * same reason: what this mail asks for is done in the admin UI, so it goes to
 * the people who can do it rather than to an inbox they would have to be
 * watching. Its Reply-To is the support inbox all the same; see the send site
 * for which half of the two-kinds convention that answers.
 *
 * **Everything the two reasons share has to be true of both of them.** The
 * variant owns the whole of what happened — the subject, the heading and one
 * sentence — and every other word in the mail is written as though the reader
 * does not yet know which of the two they are holding: the offer is over, the
 * seat is open again, somebody should invite whoever is next. The failure mode
 * this guards against is the shared copy quietly narrating a decline, which
 * makes the no-answer mail read like an accusation the family never earned.
 *
 * It is built with the default (English) translator, like every other mail we
 * send to ourselves: the recipient is staff, and a mail that changed language
 * with the family's locale would be a mail nobody could grep.
 */
export function buildSeatOfferStaffEmail(
  t: EmailTranslator,
  locale: string,
  opts: SeatOfferStaffEmailOptions,
): string {
  const title = t(`seatOfferStaff.${opts.reason}.heading`);
  const rows: Array<[string, string]> = [
    [t("seatOfferStaff.participant"), escapeHtml(opts.participantName)],
    [t("seatOfferStaff.contact"), escapeHtml(opts.contactName)],
    // Displayed, never linked — the same treatment the feedback mail gives an
    // address, and for the same reason: a client that invents its own link
    // paints a link we did not write in a colour we did not choose. This mail
    // replies to the support inbox rather than to the family, so the address
    // here is a fact about the case and not a control: a live mailto beside it
    // would be the one obvious thing to click on a mail whose actual next step
    // is the button at the bottom.
    [t("seatOfferStaff.contactEmail"), defuseAutolinks(escapeHtml(opts.contactEmail))],
    [t("seatOfferStaff.product"), escapeHtml(opts.productName)],
    ...(opts.productSchedule
      ? ([[t("seatOfferStaff.schedule"), escapeHtml(opts.productSchedule)]] as Array<[string, string]>)
      : []),
    [t("seatOfferStaff.offeredAt"), escapeHtml(opts.offeredAt)],
  ];

  const content = `
    ${heading(title)}
    ${paragraph(t(`seatOfferStaff.${opts.reason}.body`))}
    ${factTable(rows)}
    ${paragraph(t("seatOfferStaff.nextStep"))}
    ${ctaButton({ href: opts.adminProductUrl, label: t("seatOfferStaff.button") })}
  `;
  return wrapInLayout({ title, content, locale, t });
}

export function seatOfferStaffSubject(
  t: EmailTranslator,
  { reason, participantName, productName }: SeatOfferStaffEmailOptions,
): string {
  return t(`seatOfferStaff.${reason}.subject`, { participantName, productName });
}
