"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import type { ProductBrowseRow, ProductType } from "@/types";
import { resolveLocale } from "@/lib/constants/locales";
import {
  CURRENCY_CONFIG,
  DEFAULT_CURRENCY,
  type SupportedCurrency,
} from "@/lib/constants/currency";
import {
  firstChargeAnchor,
  formatFirstChargeDate,
} from "@/lib/stripe/first-charge-anchor";
import { useNow, useTimezone } from "@/providers";
import { buildPricingOption, type PricingOption } from "./pricing-options";
import type { AuthState } from "./signup-panel-view";

// The slice of `SignupPanelView`'s props that is identical whether the panel
// fires real mutations (production `SignupPanel`) or just navigates (preview
// `PreviewSignupPanel`): pricing, gamer selection, the rules checkbox, and the
// locale/currency. BOTH panels build their view props from this one hook, so
// the only thing that can differ between prod and preview is the injected
// action (`onSubmit` / `onJoinWaitlist`). The demo therefore can't silently
// drift from the real UI — anything visual lives in `SignupPanelView`, and
// everything feeding it lives here.
export interface SignupPanelFields {
  productType: ProductType;
  /** `products.for_gamers` — see the prop of the same name on the view. */
  forGamers: boolean;
  pricingOption: PricingOption;
  /**
   * The formatted date of the first charge, when this product's billing is
   * deferred to a start date it has not reached yet — or `null` when the parent
   * is charged at checkout, which is every other product.
   *
   * Already formatted, because the projection is not a display detail: an
   * unclamped anchor *is* the club's start date and is rendered as the bare
   * calendar date the rest of the page shows, while a clamped one is a true
   * instant with no calendar date of its own and is projected into the viewer's
   * zone. Handing the view a Date would leave that decision somewhere it can be
   * made differently.
   */
  firstChargeDate: string | null;
  selectedParticipantId: string | null;
  onSelectParticipant: (participantId: string) => void;
  agreed: boolean;
  onAgreedChange: (next: boolean) => void;
  /**
   * The consent documents this product requires, as slugs, in the order the
   * panel renders them. Empty on nearly every product.
   *
   * **A slug this deploy cannot name stays in here.** The panel lists it as its
   * raw slug with no link to read, and the section still gates the CTA —
   * dropping it would let an enrolment through without a consent the product
   * legally requires, which is the one outcome worse than an ugly list entry.
   */
  requiredConsentSlugs: readonly string[];
  /**
   * Whether the parent has agreed to all of them — one fact, because the
   * documents come together and cannot be accepted apart.
   *
   * Never seeded: false at mount on every product, however many times this
   * family has enrolled before, and false again whenever the requirement set
   * itself changes underneath.
   */
  consentsAgreed: boolean;
  onConsentsAgreedChange: (next: boolean) => void;
  currency: SupportedCurrency;
  locale: string;
}

export function useSignupPanelFields(
  product: Pick<
    ProductBrowseRow,
    | "product_type"
    | "billing_mode"
    | "product_prices"
    | "for_gamers"
    | "start_date"
    | "timezone"
  >,
  authState: AuthState,
  /**
   * The consent documents enrolling on this product requires, as slugs.
   *
   * A separate argument rather than a column on the `Pick` above, because the
   * requirement set is not on the browse row: `BROWSE_SELECT` is a deliberate
   * promise about what the anon shop listing publishes, and a card never names
   * a product's enrolment conditions. The detail page reads them off its own
   * query's embed and hands them in; the preview twin hands in a literal.
   */
  requiredConsentSlugs: readonly string[],
): SignupPanelFields {
  // Platform is EUR-only; Stripe Adaptive Pricing handles the customer's local
  // currency at checkout. See src/lib/constants/currency.ts.
  const currency = DEFAULT_CURRENCY;
  const locale = resolveLocale(useLocale());
  // The shared, server-seeded clock rather than a bare `new Date()`: this feeds
  // a date the server renders too, and a per-render wall clock would differ
  // across hydration.
  //
  // Pinned to its first-render value, though, because that clock ticks every 30
  // seconds and the first-charge line is *conditional* on it: a page left open
  // across product-local midnight of the start date would watch the line vanish
  // and the CTA jump up under the reader's cursor — a layout change on data's
  // own schedule, which the layout rule forbids. Seeding from `useNow()` keeps
  // SSR and hydration agreeing; freezing it keeps the panel still. The line is
  // a promise about the click, and the click is minutes away at most.
  const [now] = useState(useNow());
  const viewerTimezone = useTimezone();

  const pricingOption = useMemo(
    () =>
      buildPricingOption({
        prices: product.product_prices,
        billingMode: product.billing_mode,
        productType: product.product_type,
        currency,
        currencyLabel: CURRENCY_CONFIG[currency].label,
      }),
    [product.product_prices, product.billing_mode, product.product_type, currency],
  );

  // What the parent is told before they click, computed from the same helper the
  // checkout route sets the anchor with — so the page and Stripe cannot state
  // different dates. Only subscriptions defer: the anchor is a subscription
  // parameter, and a one-off camp is charged when it is bought.
  //
  // Drift between this render and the actual checkout is immaterial (minutes),
  // with one honest edge: a *clamped* date is measured from "now", so a tab left
  // open overnight states a date a day earlier than the session would set. The
  // authoritative figures are on Stripe's own page and on the confirmation.
  const startDate = product.start_date;
  const firstChargeDate = useMemo(() => {
    if (pricingOption.kind !== "subscription" || startDate === null) return null;
    const anchor = firstChargeAnchor(startDate, product.timezone, now);
    if (anchor === null) return null;
    // Clamped-vs-not, and what that means for the rendered date, is decided in
    // the anchor helper — the same call the confirmation page makes, so the two
    // surfaces cannot state different days for the same charge.
    return formatFirstChargeDate(
      anchor,
      startDate,
      product.timezone,
      locale,
      viewerTimezone,
    );
  }, [pricingOption.kind, startDate, product.timezone, now, locale, viewerTimezone]);

  // Only participants who aren't already on the product are selectable. The
  // default falls to the first selectable one (skipping anyone already signed
  // up / waitlisted); a user pick of a now-locked row is ignored. When everyone
  // is already on, this resolves to null and the CTA stays disabled — the page
  // still renders, the picker just shows their states.
  //
  // The parent's own row (a for-parents product) is an ordinary member of this
  // list: the adapter puts it in the array and nothing here has to know. On a
  // parents-only product it is the only row, so "the first selectable one"
  // is the preselection the plan asks for, with no special case.
  const [userPickedParticipantId, setUserPickedParticipantId] = useState<
    string | null
  >(null);
  const selectable =
    authState.kind === "ready"
      ? authState.participants.filter((p) => !p.signupState)
      : [];
  const selectedParticipantId: string | null =
    authState.kind === "ready"
      ? userPickedParticipantId !== null &&
        selectable.some((p) => p.id === userPickedParticipantId)
        ? userPickedParticipantId
        : (selectable[0]?.id ?? null)
      : null;

  const [agreed, setAgreed] = useState(false);

  // The box starts unticked, and there is no path that seeds it. These are
  // per-enrolment conditions: a family enrolling a second child, or re-joining
  // a term later, is agreeing again, and a pre-ticked box would make that
  // agreement something the platform asserted on their behalf rather than
  // something they did.
  //
  // **The agreement is stamped with the set it was given for, and does not
  // survive that set changing.** One tick now covers every listed document, so
  // a requirement added under a long-open tab — or arriving in the refetch the
  // enrolment routes trigger when the database refuses a stale list — would
  // otherwise be carried by a click made before that document was on screen.
  // Comparing the stamp during render rather than clearing it from an effect
  // keeps the tick and the list it belongs to consistent in every frame; the
  // key is the joined slugs so a caller rebuilding the array each render (which
  // both adapters do) does not count as a change.
  const slugsKey = requiredConsentSlugs.join(" ");
  const [consent, setConsent] = useState<{ slugsKey: string; agreed: boolean }>(
    () => ({ slugsKey, agreed: false }),
  );
  const consentsAgreed = consent.slugsKey === slugsKey && consent.agreed;

  return {
    productType: product.product_type,
    forGamers: product.for_gamers,
    pricingOption,
    firstChargeDate,
    selectedParticipantId,
    onSelectParticipant: setUserPickedParticipantId,
    agreed,
    onAgreedChange: setAgreed,
    requiredConsentSlugs,
    consentsAgreed,
    onConsentsAgreedChange: (next) => setConsent({ slugsKey, agreed: next }),
    currency,
    locale,
  };
}
