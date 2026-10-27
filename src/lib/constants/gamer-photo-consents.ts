import type { GamerPhotoConsentType } from "@/types";
import { ROUTES } from "./routes";

/**
 * What the app needs in order to *ask* whether photos and video of a child may
 * be taken and used: the sentence that asks it, and where the `<privacy>` tag
 * inside that sentence points.
 *
 * The twin of `MarketingConsentAsk` one file over, with the subject changed.
 * A marketing consent is about an adult's mailbox and is held by the person
 * answering; this one is about a **child's image** and is answered by their
 * parent on the child's behalf — which is why the stored answer is keyed per
 * gamer rather than per account, and why the sentence a parent ticks is written
 * about their child rather than about themselves.
 *
 * The split of responsibilities is identical: the database owns which consents
 * exist (the `gamer_photo_consent_type` enum) and which products ask for which
 * (`product_gamer_photo_consents`); this owns the two things it has no business
 * knowing.
 */
export interface GamerPhotoConsentAsk {
  /**
   * Key under the `productDetail.signupPanel.consents.gamerPhoto` message
   * namespace — the sentence a parent ticks. Not the enum value itself, for the
   * same reason the marketing twin keeps the two apart: an underscored
   * identifier is a fine JSON key and a poor translator key, and a migration
   * renaming the enum should not reach into five locale files.
   */
  sentenceKey: "lynxEducate";
  /**
   * Where the `<privacy>` chunk in that sentence goes — the Creator Academy
   * Privacy Policy, which is the document that explains what a tick actually
   * permits. Opened in a NEW TAB, like the required-documents links and for the
   * same reason: the panel behind it is holding a chosen child and a
   * half-answered form that has to survive the reading.
   *
   * The marketing twin links the *partner's own site*, because the question
   * there is "who am I handing my address to". Here the question is "what may
   * be done with a photograph of my child", and only the policy answers it.
   */
  href: string;
}

/**
 * **The photo consents a product may be made to ask for, in the order a form
 * offers them.**
 *
 * There is one, and its being Lynx-specific is the point rather than a stage on
 * the way to a generic ask. School of Gaming does not use gamer photos on its
 * own products, so it does not ask — a house-wide "may we photograph your
 * child" box would be a question we have no use for the answer to, which is the
 * shape of ask that trains parents to tick without reading. The consent exists
 * because the Roblox Programme delivered with Lynx Educate brings real photos
 * of children where session photos used to be in-game screenshots. A future
 * partner with the same need adds an enum value and a sentence; nothing else
 * moves.
 *
 * A tuple rather than the map's key order, because the order is a decision: it
 * is the order an admin reads the picker in and the order a parent meets the
 * boxes in, and neither should depend on how an object literal was typed.
 */
export const ATTACHABLE_GAMER_PHOTO_CONSENT_TYPES = [
  "lynx_educate",
] as const satisfies readonly GamerPhotoConsentType[];

export type AttachableGamerPhotoConsentType =
  (typeof ATTACHABLE_GAMER_PHOTO_CONSENT_TYPES)[number];

/** How each attachable consent is asked for. Keyed by the enum value. */
export const GAMER_PHOTO_CONSENT_ASKS: Readonly<
  Record<AttachableGamerPhotoConsentType, GamerPhotoConsentAsk>
> = {
  lynx_educate: { sentenceKey: "lynxEducate", href: ROUTES.robloxPrivacy },
};

/**
 * The attachable tuple as a set typed at the *enum*, which is what lets the
 * membership test below be written without a cast.
 *
 * The marketing twin asks the same question with `.some((known) => known === type)`
 * and cannot here, for a reason that is about this enum rather than about the
 * code: `gamer_photo_consent_type` currently has exactly one member, so a
 * comparison between two of its values is one the compiler can already answer,
 * and the linter rightly refuses an always-true condition. Widening at the
 * declaration rather than casting at the call site keeps the question honest —
 * and it goes on being honest on the day a second partner joins the enum,
 * rather than turning back into a comparison somebody has to notice.
 */
const ATTACHABLE_GAMER_PHOTO_CONSENT_TYPE_SET: ReadonlySet<GamerPhotoConsentType> =
  new Set(ATTACHABLE_GAMER_PHOTO_CONSENT_TYPES);

/** Whether this deploy knows how to offer and ask for a stored consent type. */
export function isAttachableGamerPhotoConsent(
  type: GamerPhotoConsentType,
): type is AttachableGamerPhotoConsentType {
  return ATTACHABLE_GAMER_PHOTO_CONSENT_TYPE_SET.has(type);
}

/**
 * One row of a product's photo-consent ask set: the consent, and how to ask for
 * it.
 *
 * The same rows serve both ends — the admin form offers one per row, the signup
 * panel renders one box per row — so neither surface can invent an ask the
 * other does not have.
 */
export interface GamerPhotoConsentAskRow {
  type: AttachableGamerPhotoConsentType;
  ask: GamerPhotoConsentAsk;
}

/**
 * A product's stored ask set, as the rows a parent meets — in registry order,
 * and **dropping any type this deploy cannot name**.
 *
 * Same reasoning as the marketing twin, and it survives the change of subject.
 * A required document that vanished from the app would let an enrolment through
 * without a legally required agreement, so it is kept and rendered raw. A photo
 * ask that vanished merely goes unasked — and an unasked photo consent is
 * *absent*, which every surface renders exactly as a stored "no": the child
 * stays out of the photographs. Failing closed is what makes dropping the row
 * safe here, and it is why showing a bare enum value beside a sentence would be
 * strictly worse than not asking.
 */
export function describeGamerPhotoConsents(
  types: readonly GamerPhotoConsentType[],
): GamerPhotoConsentAskRow[] {
  const stored = new Set(types);
  return ATTACHABLE_GAMER_PHOTO_CONSENT_TYPES.filter((type) =>
    stored.has(type),
  ).map((type) => ({ type, ask: GAMER_PHOTO_CONSENT_ASKS[type] }));
}
