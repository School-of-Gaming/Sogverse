import { DARK_THEME } from "@/lib/constants/colors";
import { RADIUS } from "@/lib/constants/radius";
import { wrapInLayout } from "./layout";
import { ctaButton } from "./blocks";
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
 * It goes to the support inbox rather than to every admin individually — the
 * decision the owner made for this flow, and the same inbox a family replying
 * to anything else lands in, so the seat and the conversation about it are in
 * one place.
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
    // paints a link we did not write in a colour we did not choose. This mail's
    // Reply-To is not this address (it is the family's, so replying answers
    // them), which makes the defusing the only thing standing between a staff
    // reader and an accidental send.
    [t("seatOfferStaff.contactEmail"), defuseAutolinks(escapeHtml(opts.contactEmail))],
    [t("seatOfferStaff.product"), escapeHtml(opts.productName)],
    ...(opts.productSchedule
      ? ([[t("seatOfferStaff.schedule"), escapeHtml(opts.productSchedule)]] as Array<[string, string]>)
      : []),
    [t("seatOfferStaff.offeredAt"), escapeHtml(opts.offeredAt)],
  ];

  const lastIndex = rows.length - 1;
  const factTable = rows
    .map(
      ([label, value], index) => `
            <tr>
              <td style="padding:12px 16px;color:${DARK_THEME.mutedFg};font-size:13px;${index === lastIndex ? "" : `border-bottom:1px solid ${DARK_THEME.border};`}width:140px;">${label}</td>
              <td style="padding:12px 16px;color:${DARK_THEME.foreground};font-size:14px;${index === lastIndex ? "" : `border-bottom:1px solid ${DARK_THEME.border};`}">${value}</td>
            </tr>`,
    )
    .join("");

  const content = `
    ${heading(title)}
    ${paragraph(t(`seatOfferStaff.${opts.reason}.body`))}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid ${DARK_THEME.border};border-radius:${RADIUS.lg};">
      ${factTable}
    </table>
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
