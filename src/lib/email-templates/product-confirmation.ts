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
 * The one axis this mail branches on. Three of the four are price shapes and
 * the fourth is an outcome, which is not an oversight: a waitlist join has no
 * price to state, so the mode that has no price is the mode that changes the
 * whole mail.
 */
export const PRODUCT_CONFIRMATION_MODES = [
  "subscription",
  "upfront",
  "free",
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
   * with a name in English does not in Finnish or Swedish. Same shape as the
   * enrollment mails' self-seat variant.
   */
  isSelfSeat: boolean;
  productName: string;
  productType: ProductType;
  mode: ProductConfirmationMode;
  /**
   * The price, already formatted in the reader's locale and currency by the
   * caller. Formatting lives with the caller because it needs the product's
   * prices and the currency config; the builder stays a pure string composer.
   * Null on the modes that state no amount (`free`, `waitlist`).
   */
  priceAmount: string | null;
  /** App-generated My SOG link. */
  dashboardUrl: string;
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
  }: Pick<
    ProductConfirmationEmailOptions,
    "participantName" | "isSelfSeat" | "productName" | "productType" | "mode"
  >,
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
  {
    participantName,
    isSelfSeat,
    productName,
    productType,
    mode,
    priceAmount,
    dashboardUrl,
  }: ProductConfirmationEmailOptions,
): string {
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

  const nextItems = isWaitlist
    ? [t("productConfirmation.waitlist.next1"), t("productConfirmation.waitlist.next2")]
    : [
        isSelfSeat
          ? t("productConfirmation.next.placementSelf")
          : t("productConfirmation.next.placement", { participantName: name }),
        t(`productConfirmation.next.${mode}`),
      ];

  const content = `
    ${heading(title)}
    ${paragraph(subheading)}
    ${paragraph(`${t(`productConfirmation.typeLabel.${productType}`)}: ${product}`)}
    ${priceLine(t, mode, priceAmount)}
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
    case "waitlist":
      return "";
  }
}
