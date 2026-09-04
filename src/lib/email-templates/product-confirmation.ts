import { wrapInLayout } from "./layout";
import { escapeHtml, heading, paragraph, styledName, styledProductName } from "./utils";
import { bulletList, ctaButton, sectionLabel } from "./blocks";
import { textAttachment, type RenderedAttachment } from "./attachments";
import {
  composeProductConfirmationInvitation,
  type ProductConfirmationInvitation,
  type ProductConfirmationInvitationInput,
} from "./product-confirmation-invitation";
import type { EmailTranslator } from "./translator";
import type { ProductType } from "@/types";

/**
 * The mail that follows a signup.
 *
 * It was the emailed twin of the purchase confirmation page, deliberately the
 * same copy so that a parent who paid on their phone and then opened the mail
 * on a laptop was not told two different stories. **That is no longer the whole
 * truth, and the difference is worth knowing**: the mail now carries the
 * product's schedule — the days, the clock faces, the zone, the dates and where
 * it happens — and an `invite.ics` a parent can accept into their own calendar.
 * The page carries neither. Everything the two *do* both say still says it in
 * the same words, and the mail's schedule section is composed from the same
 * sentences as the calendar entry's own notes.
 *
 * What the mail drops is the waitlist position. The page can show it because it
 * reads it live; a number frozen into an email goes stale the moment somebody
 * ahead in the queue drops out, and a parent has no way to tell a stale number
 * from a current one. The mail says where to look for the live answer instead.
 */

/**
 * The one axis this mail branches on. Four of the five are price shapes and
 * the fifth is an outcome, which is not an oversight: a waitlist join has no
 * price to state, so the mode that has no price is the mode that changes the
 * whole mail.
 *
 * **`external` and `free` are two different price shapes, not one.** Both cost
 * the family nothing at our till, and the mail used to collapse them into
 * `free` on exactly that reasoning. It was wrong in the reader's hands: most
 * municipalities run their clubs at no charge to families, but some levy a
 * small fee of their own, and a parent who has already been told that by their
 * municipality reads our "Free" as a contradiction of something they know.
 * `external` names who bears the cost and stays silent on everything either
 * side of it: what the municipality then asks of the family is not ours to
 * answer and is not news to them, and how we settle up with the municipality is
 * our arrangement rather than theirs to read. So it is a price line and no
 * "what happens next" bullet at all.
 */
export const PRODUCT_CONFIRMATION_MODES = [
  "subscription",
  "upfront",
  "free",
  "external",
  "waitlist",
] as const;

export type ProductConfirmationMode = (typeof PRODUCT_CONFIRMATION_MODES)[number];

export interface ProductConfirmationEmailOptions {
  /** The participant's first name — a child's, or the buyer's own on a self seat. */
  participantName: string;
  /**
   * True when the parent took the seat themselves. Every sentence naming the
   * participant then moves to the second person, and it moves by swapping the
   * *whole key* rather than interpolating a pronoun — a possessive that agrees
   * with a name in English does not in Finnish or Swedish.
   */
  isSelfSeat: boolean;
  productName: string;
  productType: ProductType;
  mode: ProductConfirmationMode;
  /**
   * The price, already formatted in the reader's locale and currency by the
   * caller. Formatting lives with the caller because it needs the product's
   * prices and the currency config; the builder stays a pure string composer.
   * Null on the modes that state no amount (`free`, `external`, `waitlist`).
   */
  priceAmount: string | null;
  /** App-generated My SOG link. */
  dashboardUrl: string;
  /**
   * Everything the calendar invitation is composed from, or `null` where the
   * mail is not to carry one at all.
   *
   * **`null` is the waitlist**, and it is a different absence from a schedule
   * that yields no calendar object: a place in a queue is not a seat, and an
   * entry in somebody's calendar for sessions they may never attend would be
   * the wrong promise. Everything else hands the schedule over and lets the
   * composer decide, which is where the "product has no slots yet" and "product
   * is over" answers are made.
   */
  invitation: ProductConfirmationInvitationInput | null;
}

/**
 * One render's worth of resolved content: the options it was given, and the
 * calendar object composed from them exactly once.
 *
 * **Once is the point**, and it is the same reason the calendar explorer
 * resolves once. The body, the plain-text twin and the attached file all state
 * the schedule, and a composition that ran per callback would let the mail say
 * one thing and the file beside it say another — with nothing about the
 * disagreement visible from inside any one of them.
 */
export interface ProductConfirmationContent {
  options: ProductConfirmationEmailOptions;
  /** `null` where no calendar object could be composed. See the composer. */
  invitation: ProductConfirmationInvitation | null;
}

/**
 * The options, plus the one calendar object every part of the render reads.
 *
 * A waitlist join never composes one — there is no seat behind it — and neither
 * does a product whose schedule states nothing a calendar can hold. Both come
 * back as `null`, and every part of the render then produces exactly the mail
 * this template sent before the invitation existed.
 */
export function resolveProductConfirmation(
  t: EmailTranslator,
  locale: string,
  options: ProductConfirmationEmailOptions,
): ProductConfirmationContent {
  const invitation =
    options.invitation === null || options.mode === "waitlist"
      ? null
      : composeProductConfirmationInvitation(t, locale, options.invitation);
  return { options, invitation };
}

/**
 * The subject line, from the same params the body is built from.
 *
 * It lives beside the builder rather than at either call site because there are
 * two of them — the live sends and the admin testing harness — and a subject
 * that disagrees with its body is the failure this prevents. All three axes of
 * the body reach it: the waitlist/enrolled split, the self seat, and — like the
 * confirmation page — the verb the product type calls for. A subject saying
 * "Aino is signed up" over a body saying "you are on the waitlist" is two wrong
 * answers in one line, and the inbox list is where the reader meets it first.
 *
 * Waitlist stays type-generic on purpose: waiting for a seat is the same
 * sentence whichever kind of seat it is, and a per-type waitlist verb would be
 * four ways of writing one fact.
 */
export function productConfirmationSubject(
  t: EmailTranslator,
  {
    options: { participantName, isSelfSeat, productName, productType, mode },
  }: ProductConfirmationContent,
): string {
  if (mode === "waitlist") {
    return isSelfSeat
      ? t("productConfirmation.waitlist.subjectSelf", { productName })
      : t("productConfirmation.waitlist.subject", { participantName, productName });
  }
  return isSelfSeat
    ? t(`productConfirmation.self.subject.${productType}`, { productName })
    : t(`productConfirmation.subject.${productType}`, { participantName, productName });
}

export function buildProductConfirmationEmail(
  t: EmailTranslator,
  locale: string,
  content: ProductConfirmationContent,
): string {
  const {
    options: {
      participantName,
      isSelfSeat,
      productName,
      productType,
      mode,
      priceAmount,
      dashboardUrl,
    },
    invitation,
  } = content;
  const isWaitlist = mode === "waitlist";
  const name = styledName(participantName);
  const product = styledProductName(productName);

  const title = isWaitlist
    ? t("productConfirmation.waitlist.heading")
    : t("productConfirmation.heading");

  const subheading = isWaitlist
    ? isSelfSeat
      ? t("productConfirmation.self.waitlist.subheading", { productName: product })
      : t("productConfirmation.waitlist.subheading", { participantName: name, productName: product })
    : isSelfSeat
      ? t(`productConfirmation.self.subheading.${productType}`, { productName: product })
      : t(`productConfirmation.subheading.${productType}`, { participantName: name, productName: product });

  // A municipality registration contributes no money line here, and that is the
  // whole of what this mail has to say about its cost. The bullet it used to
  // take said there was nothing to pay; the honest replacements were all some
  // version of who we invoice, which is our arrangement with the municipality
  // and not a thing a parent has any use for. So the list is the placement
  // sentence alone, and the price line above carries the fact by itself.
  const nextItems = isWaitlist
    ? [t("productConfirmation.waitlist.next1"), t("productConfirmation.waitlist.next2")]
    : [
        isSelfSeat
          ? t("productConfirmation.next.placementSelf")
          : t("productConfirmation.next.placement", { participantName: name }),
        ...(mode === "external" ? [] : [t(`productConfirmation.next.${mode}`)]),
      ];

  const body = `
    ${heading(title)}
    ${paragraph(subheading)}
    ${paragraph(`${t(`productConfirmation.typeLabel.${productType}`)}: ${product}`)}
    ${priceLine(t, mode, priceAmount)}
    ${sessionTimesSection(t, invitation)}
    ${sectionLabel(t("productConfirmation.nextTitle"))}
    ${bulletList(nextItems)}
    ${ctaButton({ href: dashboardUrl, label: t("productConfirmation.dashboardButton") })}
  `;
  return wrapInLayout({ title, content: body, locale, t });
}

/**
 * The schedule, between the price and what happens next — and nothing at all
 * when there is no invitation.
 *
 * It sits where it does because that is the reading order of the mail's own
 * facts: what this is, what it costs, when it happens, what we do next. The
 * closing sentence names the attached file, because a `.ics` a parent has not
 * been told about is a paperclip they will not press.
 *
 * The lines are the composer's own — the same sentences the calendar entry's
 * notes carry — so the mail and the entry cannot disagree about when a club
 * meets.
 */
function sessionTimesSection(
  t: EmailTranslator,
  invitation: ProductConfirmationInvitation | null,
): string {
  if (invitation === null) return "";
  return `
    ${sectionLabel(t("productConfirmation.invite.sectionLabel"))}
    ${[...invitation.scheduleLines, ...invitation.placeLines]
      .map((line) => paragraph(escapeHtml(line)))
      .join("\n    ")}
    ${paragraph(t("productConfirmation.invite.attached"))}
  `;
}

/**
 * The whole mail as plain text.
 *
 * **Not a courtesy fallback — on a Microsoft mailbox it is the calendar entry's
 * notes.** Exchange fills the entry from the message body, and with only HTML
 * to work from it flattens the markup into them: a parent opening the session
 * in their calendar finds the mail's table structure and the provider's
 * tracking pixel rendered as text. So it is the mail's own words, in the mail's
 * own order.
 *
 * It is stated only when the mail carries the calendar part, because that is
 * the only reason it exists. Every other send is HTML alone, as it always was.
 */
export function productConfirmationText(
  t: EmailTranslator,
  content: ProductConfirmationContent,
): string | undefined {
  const { invitation } = content;
  if (invitation === null) return undefined;

  const {
    options: {
      participantName,
      isSelfSeat,
      productName,
      productType,
      mode,
      priceAmount,
      dashboardUrl,
    },
  } = content;

  const lines: string[] = [
    t("productConfirmation.heading"),
    "",
    isSelfSeat
      ? t(`productConfirmation.self.subheading.${productType}`, { productName })
      : t(`productConfirmation.subheading.${productType}`, { participantName, productName }),
    "",
    `${t(`productConfirmation.typeLabel.${productType}`)}: ${productName}`,
  ];

  const price = plainPriceLine(t, mode, priceAmount);
  if (price !== null) lines.push(price);

  lines.push(
    "",
    t("productConfirmation.invite.sectionLabel"),
    ...invitation.scheduleLines,
    ...invitation.placeLines,
    "",
    t("productConfirmation.invite.attached"),
    "",
    t("productConfirmation.nextTitle"),
    isSelfSeat
      ? t("productConfirmation.next.placementSelf")
      : t("productConfirmation.next.placement", { participantName }),
  );
  // `external` states no bullet at all — see the mode note above.
  if (mode !== "external" && mode !== "waitlist") {
    lines.push(t(`productConfirmation.next.${mode}`));
  }

  lines.push("", `${t("productConfirmation.dashboardButton")}: ${dashboardUrl}`);

  return lines.join("\n");
}

/**
 * The `invite.ics`, or nothing at all.
 *
 * **The file name is load-bearing.** The provider infers the media type from
 * the extension, and `invite.ics` is what makes a client read the part as an
 * invitation it can act on rather than as a file to download — which is the
 * difference between an entry that lands in a calendar and one a parent has to
 * add by hand.
 */
export function productConfirmationAttachments(
  content: ProductConfirmationContent,
): RenderedAttachment[] {
  return content.invitation === null
    ? []
    : [textAttachment("invite.ics", content.invitation.ics)];
}

/**
 * The price line, or nothing. A waitlist join has no price, and a paid mode
 * with no amount in hand states nothing rather than a blank figure — an empty
 * price beside a product name reads as "free", which is the one thing it must
 * never be mistaken for.
 */
function priceLine(
  t: EmailTranslator,
  mode: ProductConfirmationMode,
  priceAmount: string | null,
): string {
  const line = plainPriceLine(t, mode, priceAmount === null ? null : escapeHtml(priceAmount));
  return line === null ? "" : paragraph(line);
}

/**
 * The same line as words, shared by the HTML and the text body so the two
 * cannot state different prices. The caller escapes for its own destination.
 */
function plainPriceLine(
  t: EmailTranslator,
  mode: ProductConfirmationMode,
  priceAmount: string | null,
): string | null {
  const label = t("productConfirmation.priceLabel");
  switch (mode) {
    case "subscription":
    case "upfront":
      return priceAmount === null
        ? null
        : `${label}: ${t(`productConfirmation.price.${mode}`, { amount: priceAmount })}`;
    case "free":
      return `${label}: ${t("productConfirmation.price.free")}`;
    case "external":
      return `${label}: ${t("productConfirmation.price.external")}`;
    case "waitlist":
      return null;
  }
}
