import { wrapInLayout } from "./layout";
import { heading, paragraph, styledName, styledProductName } from "./utils";
import { calloutPanel, ctaButtonRow } from "./blocks";
import type { EmailTranslator } from "./translator";

export interface SeatOfferEmailOptions {
  /** Whoever holds the queued place — a child, or the parent themselves. */
  participantName: string;
  /** True when the parent queued for their own seat; every sentence moves into the second person. */
  isSelfSeat: boolean;
  productName: string;
  /**
   * The deadline as an absolute date and time, already formatted in the
   * reader's locale with the zone named. A relative "in 5 days" is forbidden
   * here: a mail is read whenever it is read, and a family opening this one on
   * Thursday must not be told they have until Tuesday when they have until
   * Sunday.
   */
  deadline: string;
  acceptUrl: string;
  declineUrl: string;
}

/**
 * The seat offer, to the parent.
 *
 * **It is the answer to a promise already made.** The waitlist-confirmation
 * mail ends "We'll email you the moment a seat opens", so this one opens as
 * that moment arriving rather than introducing itself — a family who has been
 * waiting recognises what this is from the first line, and one who has
 * forgotten is reminded by the product's name in the sentence under it.
 *
 * **Two buttons, one ask.** `ctaButtonRow` puts Accept and Decline side by side
 * because they are alternatives rather than a first and second choice, and its
 * type forbids two filled brand buttons for exactly that reason — so Accept
 * takes the emphasized variant the row allows and Decline is outlined. The mail
 * genuinely wants an answer either way, but it is asking them to come.
 *
 * **The deadline is a date, in a panel, and never a countdown.** It is the one
 * thing in the mail that stops being true, so it is stated absolutely and given
 * the callout rather than being buried in a sentence.
 */
export function buildSeatOfferEmail(
  t: EmailTranslator,
  locale: string,
  {
    participantName,
    isSelfSeat,
    productName,
    deadline,
    acceptUrl,
    declineUrl,
  }: SeatOfferEmailOptions,
): string {
  const voice = isSelfSeat ? "self" : "child";
  const content = `
    ${heading(t("seatOffer.heading"))}
    ${paragraph(
      t(`seatOffer.${voice}.opening`, {
        participantName: styledName(participantName),
        productName: styledProductName(productName),
      }),
    )}
    ${paragraph(t("seatOffer.question"))}
    ${calloutPanel({
      label: t("seatOffer.deadlineLabel"),
      paragraphs: [t("seatOffer.deadlineBody", { deadline })],
    })}
    ${ctaButtonRow(
      { href: acceptUrl, label: t("seatOffer.accept"), variant: "secondary" },
      { href: declineUrl, label: t("seatOffer.decline"), variant: "outline" },
    )}
    ${paragraph(t("seatOffer.alsoInMySog"))}
  `;
  return wrapInLayout({ title: t("seatOffer.heading"), content, locale, t });
}

/**
 * The subject line. It names the child and the product, because an inbox list
 * is where this mail has to be recognised — "a seat has opened" alone is
 * indistinguishable from marketing.
 */
export function seatOfferSubject(
  t: EmailTranslator,
  { participantName, isSelfSeat, productName }: SeatOfferEmailOptions,
): string {
  return isSelfSeat
    ? t("seatOffer.self.subject", { productName })
    : t("seatOffer.child.subject", { participantName, productName });
}
