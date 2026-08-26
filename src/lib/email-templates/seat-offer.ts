import { wrapInLayout } from "./layout";
import { heading, paragraph, styledName, styledProductName } from "./utils";
import { calloutPanel, ctaButton, ctaButtonRow } from "./blocks";
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
  /** App-generated My SOG link — the parent dashboard, where the same question waits. */
  dashboardUrl: string;
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
 * **Two buttons, one ask, and the affirmative one is on the right.**
 * `ctaButtonRow` puts Accept and Decline side by side because they are
 * alternatives rather than a first and second choice, and its type forbids two
 * filled brand buttons for exactly that reason — so Accept takes the emphasized
 * variant the row allows and Decline is outlined. Their *order* is the app's own
 * convention, written down on `DialogFooter`: the negative answer is authored
 * first and the affirmative last, so Decline is the left cell and Accept the
 * right one. A mail has no stacked arrangement to reconcile — the row's 50/50
 * split is the layout at every width — but reading the same pair in the opposite
 * order in an inbox and in My SOG is exactly the kind of small disagreement the
 * convention exists to remove.
 *
 * **The one filled brand button in this mail is My SOG, and that is a
 * deliberate choice about where the answer is best given.** `ctaButtonRow`'s
 * type keeps the Accept/Decline pair at `secondary`/`outline` whatever else the
 * mail carries, so the primary variant was free — and it goes to the in-app
 * path, under the sentence promising the same question is waiting there. The
 * emphasis is not a third answer competing with the two above it: it is the
 * route that lands a signed-in parent on their own card, with the child's name,
 * the schedule and the queue in front of them, rather than on a page that knows
 * only what a token carries.
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
    dashboardUrl,
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
      // No `escapeHtml` on the deadline, and that is a statement about where it
      // comes from rather than an oversight: every path that reaches this
      // builder produces it with `Intl`, from a timestamp and a zone, so there
      // is no user-authored character in it — and the one other path, an admin
      // typing it into the testing registry, is admin-only input on a mail
      // addressed to whoever typed it.
      paragraphs: [t("seatOffer.deadlineBody", { deadline })],
    })}
    ${ctaButtonRow(
      { href: declineUrl, label: t("seatOffer.decline"), variant: "outline" },
      { href: acceptUrl, label: t("seatOffer.accept"), variant: "secondary" },
    )}
    ${paragraph(t("seatOffer.alsoInMySog"))}
    ${ctaButton({ href: dashboardUrl, label: t("seatOffer.dashboardButton") })}
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
