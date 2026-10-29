import type { MarketingConsentType } from "@/types";

/**
 * **The partner's own site, named once.**
 *
 * A parent being asked to hand their address to somebody else has to be able to
 * go and look at who that somebody is, so every sentence that asks the question
 * carries this link — the settings card and the product signup panel alike. One
 * constant so the two cannot drift onto different URLs, and so a partner who
 * moves domain is one edit rather than a grep.
 */
export const LYNX_EDUCATE_URL = "https://lynxeducate.com";

/**
 * What the app needs in order to *ask* for one marketing consent: the sentence
 * that asks it, and where the `<link>` inside that sentence points.
 *
 * The database owns which consents exist (the `marketing_consent_type` enum)
 * and which products ask for which (`product_marketing_consents`); this owns
 * the two things it has no business knowing. Exactly the split
 * `CONSENT_DOCUMENTS` makes one system over, for exactly the same reason.
 */
export interface MarketingConsentAsk {
  /**
   * Key under the `productDetail.signupPanel.consents.marketing` message
   * namespace — the sentence a parent ticks. Not the enum value itself: an
   * underscored identifier is a fine JSON key and a poor translator key, and
   * keeping the two apart means the enum could be renamed by migration without
   * touching five locale files.
   */
  sentenceKey: "lynxEducate" | "schoolOfGaming";
  /**
   * Where the `<link>` chunk in that sentence goes. Opened in a NEW TAB, the
   * same way a required consent's documents are and for the same reason: the
   * panel behind it is holding a chosen child and a half-answered form that has
   * to survive the reading. `null` for our own list, whose sentence names no
   * one the reader has to go and look up, and carries no link.
   */
  href: string | null;
  /**
   * Where the parent's answer is recorded, which decides how it travels.
   *
   * - `account` — a partner's list: one standing answer on the account, written
   *   through `set_marketing_consent` from the panel, whichever door the parent
   *   took.
   * - `seat` — School of Gaming's own list: Klaviyo owns that consent, so the
   *   answer is never written to the account (`set_marketing_consent` refuses
   *   it). It is stored on the seat the booking creates and reaches Klaviyo
   *   with the enrolment, so it travels in the enrolment request itself — and
   *   only a request that creates a seat can carry it.
   */
  recordedOn: "account" | "seat";
}

/**
 * **The marketing consents a product may be made to ask for, in the order a
 * form offers them.**
 *
 * A partner's list, on the products that partnership covers, and School of
 * Gaming's own — whose answer is recorded on the seat rather than the account
 * (see `recordedOn`).
 *
 * A tuple rather than the map's key order, because the order is a decision: it
 * is the order an admin reads the picker in and the order a parent meets the
 * boxes in, and neither should depend on how an object literal was typed.
 */
export const ATTACHABLE_MARKETING_CONSENT_TYPES = [
  "school_of_gaming",
  "lynx_educate",
] as const satisfies readonly MarketingConsentType[];

export type AttachableMarketingConsentType =
  (typeof ATTACHABLE_MARKETING_CONSENT_TYPES)[number];

/** How each attachable consent is asked for. Keyed by the enum value. */
export const MARKETING_CONSENT_ASKS: Readonly<
  Record<AttachableMarketingConsentType, MarketingConsentAsk>
> = {
  school_of_gaming: {
    sentenceKey: "schoolOfGaming",
    href: null,
    recordedOn: "seat",
  },
  lynx_educate: {
    sentenceKey: "lynxEducate",
    href: LYNX_EDUCATE_URL,
    recordedOn: "account",
  },
};

/**
 * Whether this deploy knows how to offer and ask for a stored consent type.
 *
 * `some` rather than a widening cast on the tuple: the comparison is between
 * two members of one enum, so it needs no help, and a cast here is the kind
 * that quietly survives the tuple changing shape.
 */
export function isAttachableMarketingConsent(
  type: MarketingConsentType,
): type is AttachableMarketingConsentType {
  return ATTACHABLE_MARKETING_CONSENT_TYPES.some((known) => known === type);
}

/**
 * One row of a product's marketing ask set: the consent, and how to ask for it.
 *
 * The same rows serve both ends — the admin form offers one per row, the signup
 * panel renders one box per row — so neither surface can invent an ask the
 * other does not have.
 */
export interface MarketingConsentAskRow {
  type: AttachableMarketingConsentType;
  ask: MarketingConsentAsk;
}

/**
 * A product's stored ask set, as the rows a parent meets — in registry order,
 * and **dropping any type this deploy cannot name**.
 *
 * That is the exact opposite of what `describeRequiredConsents` does with a slug
 * it cannot name, and the difference is what the two kinds of consent are for. A
 * required document that vanished from the app would let an enrolment through
 * without a legally required agreement, so it is kept and rendered raw. A
 * marketing ask that vanished merely goes unasked: nothing is granted, nothing
 * is withdrawn, and the parent can still answer it in their settings. Showing a
 * bare enum value beside a sentence would be worse than not asking.
 */
export function describeMarketingConsents(
  types: readonly MarketingConsentType[],
): MarketingConsentAskRow[] {
  const stored = new Set(types);
  return ATTACHABLE_MARKETING_CONSENT_TYPES.filter((type) =>
    stored.has(type),
  ).map((type) => ({ type, ask: MARKETING_CONSENT_ASKS[type] }));
}
