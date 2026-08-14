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
