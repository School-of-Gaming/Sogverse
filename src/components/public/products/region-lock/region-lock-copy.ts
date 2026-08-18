/**
 * **Draft English copy for the region lock — deliberately NOT in `messages/`.**
 *
 * Three candidate shapes for the block are in front of the product owner at
 * once (`/preview/products/region-*`), and two of them are going to be deleted.
 * Translating all three into five locales would be work thrown away on the two
 * losers, and — worse — would put half-decided wording into the message files,
 * where a translator has no way to tell a candidate from a shipped string.
 *
 * **Promotion moves every string below into `messages/` under
 * `productDetail.signupPanel`, in every locale, and this module is deleted.**
 * Until then these are the only user-facing strings on the product page that do
 * not go through next-intl, and they are literals in a plain `.ts` module
 * precisely so that stays visible: nothing here is reachable from a component
 * without importing the word "draft".
 *
 * Two things about the wording are decisions rather than placeholders, and
 * should survive into whatever the final copy says:
 *
 * - **The no-location case never names the country.** It is a question about
 *   the family, and naming the answer that unlocks the page turns it into a
 *   hint. The parent is told their location is needed, not which one to pick.
 * - **The wrong-country case does name it.** A refusal that will not say what
 *   it is refusing on leaves the reader with nothing to do and nothing to
 *   understand, and the country is not a secret — the shop is simply not sold
 *   here.
 *
 * Nothing here mentions that changing the location in settings would walk
 * straight through the block. The lock is a soft, UI-only statement about who a
 * product is offered to, and advertising its own bypass is not copy anybody
 * wants to ship.
 */
export const regionLockCopy = {
  /** Heading over the no-location note / overlay. */
  noLocationTitle: "Where is your family?",
  /**
   * The no-location body. Says a location is needed and why, without naming the
   * country this product wants.
   */
  noLocationBody:
    "This product is only offered to families in certain countries. Tell us where your family lives and we can check whether you can sign up.",
  /** The action that opens the set-location dialog, wherever a variant offers it. */
  setLocationCta: "Set your location",

  /** Heading over the wrong-country note / overlay. */
  wrongCountryTitle: "Not offered in your country",
  /** The refusal. The country IS named — see the note above. */
  wrongCountryBody: (country: string): string =>
    `This product is only offered to families in ${country}.`,
  /**
   * The permanently-disabled CTA's label in the checklist variant. It states
   * the situation rather than an action, because there is no next step on this
   * page: every other disabled label in that button names something the parent
   * can go and do.
   */
  wrongCountryCta: "Not available in your country",

  /** The set-location dialog. */
  dialog: {
    title: "Where is your family?",
    description:
      "We use this to work out which clubs, camps and events are offered where you live. You can change it later in your settings.",
    fieldLabel: "Your location",
    save: "Save location",
    saving: "Saving…",
    cancel: "Cancel",
  },
} as const;
