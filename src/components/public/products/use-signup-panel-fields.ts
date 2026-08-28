"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import type {
  MarketingConsentType,
  ProductBrowseRow,
  ProductType,
} from "@/types";
import { resolveLocale } from "@/lib/constants/locales";
import {
  CURRENCY_CONFIG,
  DEFAULT_CURRENCY,
  type SupportedCurrency,
} from "@/lib/constants/currency";
import {
  consentRowSlugs,
  describeRequiredConsents,
} from "@/lib/constants/consent-documents";
import { describeMarketingConsents } from "@/lib/constants/marketing-consents";
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
   * panel groups them. Empty on nearly every product.
   *
   * **A slug this deploy cannot name stays in here.** The panel offers it as its
   * raw slug with no link to read, and it still gates the CTA — dropping it
   * would let an enrolment through without a consent the product legally
   * requires, which is the one outcome worse than an ugly row.
   */
  requiredConsentSlugs: readonly string[];
  /**
   * Which consent rows the parent has ticked, by row key — the keys
   * `describeRequiredConsents` gives the same slugs.
   *
   * One entry per *bundle*, not per document: a programme hands its documents
   * over together and they cannot be accepted apart, so the sentence names them
   * all and one tick answers it. Two bundles on one product would be two ticks,
   * because they are two separate things being agreed to.
   *
   * Never seeded: empty at mount on every product, however many times this
   * family has enrolled before.
   */
  consentAgreements: ReadonlySet<string>;
  onConsentAgreementChange: (rowKey: string, agreed: boolean) => void;
  /**
   * Whether every required row is ticked — vacuously true on a product that
   * requires nothing, which is nearly all of them.
   *
   * The adapters read this to decide whether there is a consent to send; the
   * view derives the same fact from the rows it is actually painting, so a row
   * on screen and unticked blocks the CTA whatever anyone else believes.
   */
  consentsAgreed: boolean;
  /**
   * The marketing consents this product ASKS about, as stored. Empty on almost
   * every product, and the optional block ceases to exist when it is.
   *
   * Rides in from the product read like the required slugs above, which is what
   * keeps the block's *existence* settled before the panel paints — only which
   * boxes are ticked can change afterwards.
   */
  marketingConsentTypes: readonly MarketingConsentType[];
  /**
   * Which of those the reader currently has ticked: their account's stored
   * answer, overlaid with anything they have changed in this panel.
   *
   * **Seeded, and the deliberate inverse of `consentAgreements` above.** A
   * required consent is a per-enrolment event, so a pre-ticked box would be the
   * platform asserting an agreement on the family's behalf. A marketing consent
   * is a single account-level state with a present tense — the panel is showing
   * a parent what we currently believe about their mailbox, and showing them
   * `false` when the answer on file is `true` would be showing them something
   * untrue and inviting them to "fix" it into a withdrawal.
   */
  marketingConsents: ReadonlySet<MarketingConsentType>;
  onMarketingConsentChange: (
    consentType: MarketingConsentType,
    granted: boolean,
  ) => void;
  /**
   * What submitting would change about the account, and nothing else — one
   * entry per asked consent whose box now differs from what was seeded.
   *
   * Empty is the overwhelmingly common case (a parent who did not touch the
   * box), and empty means no call at all: the RPC is idempotent, but an event
   * log that recorded non-changes is exactly what its own migration refused to
   * build, so the client should not make it work to reject them either.
   *
   * Derived every render rather than computed at click time, so an adapter's
   * handler reads whatever was true in the frame the parent clicked in.
   */
  marketingConsentChanges: readonly {
    consentType: MarketingConsentType;
    granted: boolean;
  }[];
  currency: SupportedCurrency;
  locale: string;
}

/**
 * What a consent row's stamp joins its slugs on: NUL, the one byte a slug
 * cannot contain, so no two different slug lists can stamp the same string.
 */
const STAMP_SEPARATOR = "\u0000";

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
  /**
   * The marketing consents this product asks about, off the same product read.
   * Beside the product rather than on it for the reason the slugs above are:
   * `BROWSE_SELECT` publishes what a shop card paints, and a card never names
   * what signing up would ask.
   */
  marketingConsentTypes: readonly MarketingConsentType[],
  /**
   * What the reader's account currently says about those consents — the set of
   * types they have granted — or `undefined` while that read has not answered.
   *
   * **An argument rather than a query made in here**, unlike everything else
   * this hook derives. Two reasons, and either alone would settle it: the
   * preview twin has no session to read one for and must not fire the call, and
   * the read is only correct for a signed-in customer — an admin calling it
   * gets every parent's rows, because their own SELECT policy is what widens
   * it. So the adapter that knows who is looking owns the read, and this owns
   * what the panel does with the answer.
   *
   * `undefined` is not the same as an empty set: nothing is known yet. It reads
   * as "not granted" for rendering, because a box has to be drawn either way
   * and unticked is the safe direction — the box, its sentence and its hint are
   * all on screen from the first frame, so only the tick can change when the
   * answer lands, and nothing moves.
   *
   * **What that costs, stated plainly rather than argued away.** An edit
   * outranks a late seed, and an edit is recorded by the box having been
   * *touched*, not by its value differing from anything. So a parent who is
   * already opted in, and who ticks and unticks this box before their account's
   * answer arrives, submits an unticked box that counts as an edit — and the
   * enrolment records a withdrawal of a consent they never meant to withdraw.
   *
   * This is the accepted behaviour, and the rule it follows is the one worth
   * keeping: **what the box shows at submit is what is recorded.** The
   * alternative — treating a touched box that happens to match the eventual seed
   * as no answer at all — would mean the panel silently discarding an unticked
   * box a parent was looking at when they pressed the button, which is the worse
   * failure of the two and the harder one to explain. A consent is account-level
   * and revocable from settings that evening, so the cost of the case above is a
   * mailing list the parent can switch back on; the cost of the alternative is a
   * control that does not do what it says while you watch it.
   */
  seededMarketingConsents: ReadonlySet<MarketingConsentType> | undefined,
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

  // Every box starts unticked, and there is no path that seeds one. These are
  // per-enrolment conditions: a family enrolling a second child, or re-joining
  // a term later, is agreeing again, and a pre-ticked box would make that
  // agreement something the platform asserted on their behalf rather than
  // something they did.
  //
  // **Each agreement is stamped with the slugs its OWN row covered, and does
  // not survive that set changing.** A bundle's sentence names its documents
  // whatever the product stores, but the tick only ever sends what is required
  // — so a requirement added under a long-open tab, or arriving in the refetch
  // the enrolment routes trigger when the database refuses a stale list, must
  // not be carried by a click made before it was on screen.
  //
  // **Per row rather than over the whole set**, which is the one thing that
  // changed when the section grew from one box to one per bundle: a brand-new
  // drift document arrives as its own unticked row, and is no reason to
  // un-agree to a programme whose own documents did not move.
  //
  // Comparing stamps during render rather than clearing them from an effect
  // keeps every tick and the slugs it belongs to consistent in every frame. A
  // stamp is the row's slugs joined on the separator below, so a caller
  // rebuilding the array each render (which both adapters do) does not count as
  // a change.
  const [stamps, setStamps] = useState<ReadonlyMap<string, string>>(
    () => new Map<string, string>(),
  );
  const rows = describeRequiredConsents(requiredConsentSlugs);
  const currentStamps = new Map(
    rows.map((row) => [
      row.key,
      consentRowSlugs(row, requiredConsentSlugs).join(STAMP_SEPARATOR),
    ]),
  );
  const consentAgreements = new Set(
    rows
      .filter((row) => stamps.get(row.key) === currentStamps.get(row.key))
      .map((row) => row.key),
  );

  // ---------------------------------------------------------------------
  // The optional marketing asks
  //
  // **Seeded from the account, and an edit outranks a seed that lands after
  // it.** The saved-value-plus-edit-wrapper shape the settings page uses on its
  // home-location field, for the same reason: the seed arrives a round trip
  // after the panel paints, and a parent who ticked the box in that gap must
  // not watch their tick undone by an answer they were not waiting for.
  //
  // A Map rather than a Set of edited types, because `false` is a real edit —
  // it is a *withdrawal*, the whole point of a revocable consent — and a bare
  // set could not tell it from "not touched".
  //
  // Nothing here is keyed to the enrolment: the required ticks above are
  // stamped with the slugs they covered and dropped when the set moves, and
  // that machinery is deliberately absent here. A marketing answer is about the
  // reader's mailbox rather than about this seat, so a product changing what it
  // asks has nothing to say about an answer they have already given.
  // ---------------------------------------------------------------------
  const [marketingEdits, setMarketingEdits] = useState<
    ReadonlyMap<MarketingConsentType, boolean>
  >(() => new Map<MarketingConsentType, boolean>());

  const marketingRows = describeMarketingConsents(marketingConsentTypes);
  const seededValue = (consentType: MarketingConsentType) =>
    seededMarketingConsents?.has(consentType) ?? false;
  const marketingValue = (consentType: MarketingConsentType) => {
    const edit = marketingEdits.get(consentType);
    return edit === undefined ? seededValue(consentType) : edit;
  };

  const marketingConsents = new Set(
    marketingRows.map((row) => row.type).filter(marketingValue),
  );
  // Only over the rows actually on screen. A stored type this deploy cannot
  // name is not rendered, so it has no box for the reader to have moved and
  // nothing to send about it.
  const marketingConsentChanges = marketingRows
    .filter((row) => marketingValue(row.type) !== seededValue(row.type))
    .map((row) => ({
      consentType: row.type,
      granted: marketingValue(row.type),
    }));

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
    consentAgreements,
    onConsentAgreementChange: (rowKey, agreed) =>
      setStamps((prev) => {
        const next = new Map(prev);
        if (agreed) next.set(rowKey, currentStamps.get(rowKey) ?? "");
        else next.delete(rowKey);
        return next;
      }),
    // Vacuously true on a product that requires nothing, which is nearly all of
    // them — so the consent step costs the ordinary panel nothing.
    consentsAgreed: consentAgreements.size === rows.length,
    marketingConsentTypes,
    marketingConsents,
    onMarketingConsentChange: (consentType, granted) =>
      setMarketingEdits((prev) => {
        const next = new Map(prev);
        // Recorded either way — an untick is an answer, not the absence of one,
        // and deleting the entry would hand the box back to a seed that says
        // the opposite.
        next.set(consentType, granted);
        return next;
      }),
    marketingConsentChanges,
    currency,
    locale,
  };
}
