import { wrapInLayout } from "./layout";
import { escapeHtml, heading, paragraph, styledName, styledProductName } from "./utils";
import { bulletList, ctaButton, sectionLabel } from "./blocks";
import type { EmailTranslator } from "./translator";
import type { ProductType } from "@/types";

/**
 * The mail that follows a signup — the emailed twin of the purchase
 * confirmation page, and deliberately the same copy: a parent who paid on their
 * phone and then opens the mail on a laptop must not be told two different
 * stories about what just happened.
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

interface ProductConfirmationEmailOptions {
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
  /** App-generated My SOG link — the parent's root, or the child's on their copy. */
  dashboardUrl: string;
  /**
   * The child's own copy, sent beside the parent's when the child holds a
   * mailbox of their own. It speaks to the reader the way a self seat
   * does — the reader *is* the participant — and drops everything only a
   * parent can act on: the price line and the billing bullet. `isSelfSeat` is
   * ignored under it, because the child's copy of an adult's own seat does
   * not exist.
   */
  gamerCopy?: boolean;
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
    participantName,
    isSelfSeat,
    productName,
    productType,
    mode,
    gamerCopy = false,
  }: Pick<
    ProductConfirmationEmailOptions,
    "participantName" | "isSelfSeat" | "productName" | "productType" | "mode" | "gamerCopy"
  >,
): string {
  // The child reading their own copy is the participant, so the subject takes
  // the second person exactly as a self seat does.
  const secondPerson = isSelfSeat || gamerCopy;
  if (mode === "waitlist") {
    return secondPerson
      ? t("productConfirmation.waitlist.subjectSelf", { productName })
      : t("productConfirmation.waitlist.subject", { participantName, productName });
  }
  return secondPerson
    ? t(`productConfirmation.self.subject.${productType}`, { productName })
    : t(`productConfirmation.subject.${productType}`, { participantName, productName });
}

export function buildProductConfirmationEmail(
  t: EmailTranslator,
  locale: string,
  {
    participantName,
    isSelfSeat,
    productName,
    productType,
    mode,
    priceAmount,
    dashboardUrl,
    gamerCopy = false,
  }: ProductConfirmationEmailOptions,
): string {
  const isWaitlist = mode === "waitlist";
  const name = styledName(participantName);
  const product = styledProductName(productName);
  // The reader is the participant on a self seat and on the child's own copy,
  // and every sentence naming the participant moves to the second person on
  // both — by swapping whole keys, as the self seat already does.
  const secondPerson = isSelfSeat || gamerCopy;

  const title = isWaitlist
    ? t("productConfirmation.waitlist.heading")
    : t("productConfirmation.heading");

  const subheading = isWaitlist
    ? secondPerson
      ? t("productConfirmation.self.waitlist.subheading", { productName: product })
      : t("productConfirmation.waitlist.subheading", { participantName: name, productName: product })
    : secondPerson
      ? t(`productConfirmation.self.subheading.${productType}`, { productName: product })
      : t(`productConfirmation.subheading.${productType}`, { participantName: name, productName: product });

  // A municipality registration contributes no money line here, and that is the
  // whole of what this mail has to say about its cost. The bullet it used to
  // take said there was nothing to pay; the honest replacements were all some
  // version of who we invoice, which is our arrangement with the municipality
  // and not a thing a parent has any use for. So the list is the placement
  // sentence alone, and the price line above carries the fact by itself.
  //
  // The child's copy drops the billing bullet on every mode for a different
  // reason: paying is the parent's, and a sentence about being billed monthly
  // is addressed to somebody who is not the reader.
  const nextItems = isWaitlist
    ? [t("productConfirmation.waitlist.next1"), t("productConfirmation.waitlist.next2")]
    : [
        secondPerson
          ? t("productConfirmation.next.placementSelf")
          : t("productConfirmation.next.placement", { participantName: name }),
        ...(mode === "external" || gamerCopy ? [] : [t(`productConfirmation.next.${mode}`)]),
      ];

  // The child's copy is the one variant that greets the reader by name: the
  // second-person sentences under it name nobody, and a mail to a child that
  // never says who it is for reads as one that was meant for their parent.
  const greeting = gamerCopy
    ? paragraph(t("productConfirmation.gamer.greeting", { participantName: name }))
    : "";

  const content = `
    ${heading(title)}
    ${greeting}
    ${paragraph(subheading)}
    ${paragraph(`${t(`productConfirmation.typeLabel.${productType}`)}: ${product}`)}
    ${gamerCopy ? "" : priceLine(t, mode, priceAmount)}
    ${sectionLabel(t("productConfirmation.nextTitle"))}
    ${bulletList(nextItems)}
    ${ctaButton({ href: dashboardUrl, label: t("productConfirmation.dashboardButton") })}
  `;
  return wrapInLayout({ title, content, locale, t });
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
  const label = t("productConfirmation.priceLabel");
  switch (mode) {
    case "subscription":
    case "upfront":
      return priceAmount === null
        ? ""
        : paragraph(
            `${label}: ${t(`productConfirmation.price.${mode}`, { amount: escapeHtml(priceAmount) })}`,
          );
    case "free":
      return paragraph(`${label}: ${t("productConfirmation.price.free")}`);
    case "external":
      return paragraph(`${label}: ${t("productConfirmation.price.external")}`);
    case "waitlist":
      return "";
  }
}
