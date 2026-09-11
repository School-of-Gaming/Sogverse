"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import type {
  GamerPhotoConsentType,
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
import { describeGamerPhotoConsents } from "@/lib/constants/gamer-photo-consents";
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
   * Which of those the reader currently has ticked in THIS panel — nothing
   * else, and never a seed.
   *
   * **Unticked at mount on every enrolment, exactly like `consentAgreements`
   * above.** The panel used to seed these from the account, on the reasoning
   * that a marketing consent is a single present-tense state and showing
   * `false` to a parent who is opted in invites them to "fix" it into a
   * withdrawal. That reasoning lost to a simpler one: a box we ticked on a
   * parent's behalf is the platform answering a question that was asked of
   * them. Every optional box on this panel now starts empty, a parent decides
   * afresh each time, and an untouched box is recorded as the "no" it looks
   * like — the owner's call, and it is the same rule for both kinds of
   * optional ask so a reader never has to know which sort of box they are
   * looking at.
   */
  marketingConsents: ReadonlySet<MarketingConsentType>;
  onMarketingConsentChange: (
    consentType: MarketingConsentType,
    granted: boolean,
  ) => void;
  /**
   * **What the parent said about every marketing box this panel asked — one
   * entry per row on screen, whatever its value.**
   *
   * Answers, not changes. There is nothing left to diff against now that
   * nothing is seeded, and "send only what moved" would silently drop the
   * commonest answer there is: a box left alone, which is a "no" the parent
   * looked at. The writer is idempotent and appends no event for a no-op, so
   * re-stating an answer that has not moved costs a round trip and nothing
   * else.
   *
   * Only over the rows actually on screen. A stored type this deploy cannot
   * name is not rendered, so nobody answered it and nothing is sent about it.
   *
   * Derived every render rather than computed at click time, so an adapter's
   * handler reads whatever was true in the frame the parent clicked in.
   */
  marketingConsentAnswers: readonly {
    consentType: MarketingConsentType;
    granted: boolean;
  }[];
  /**
   * **The product's optional photo asks**, as stored — whether photos and
   * videos of the selected child may be taken and used. Empty on almost every
   * product, and the block ceases to exist when it is.
   *
   * Rides in from the product read like the two ask sets above, so the block's
   * existence is settled before the panel paints.
   */
  gamerPhotoConsentTypes: readonly GamerPhotoConsentType[];
  /**
   * Whether those rows can be **answered** right now — true only when the
   * selected participant is a child.
   *
   * A product whose audience admits adults lets a parent take a seat
   * themselves, and a consent about a gamer's image cannot be given about an
   * adult who is answering for themselves; there is no gamer row to key the
   * answer to. Nor is there one before anybody is selected. So the rows are
   * *disabled* in both cases, and this is what says so — computed here rather
   * than in the view, so the boxes on screen and the answers sent cannot
   * disagree about which participant was being asked about.
   *
   * It is deliberately not what decides whether the rows are drawn: the view
   * takes their existence off the product's own asks, so the section is on
   * screen from first paint and only its answerability follows the selection.
   * Everything downstream of it here — the answers, and so what is written —
   * still keys on this, which is what keeps a self seat writing nothing.
   */
  gamerPhotoConsentsEnabled: boolean;
  /**
   * Which photo boxes the reader has ticked, for the currently selected child.
   *
   * **Reset to empty whenever the selected participant changes**, because the
   * tick is about one specific child: carrying it across a switch would record
   * a permission for a sibling nobody gave it for. That is the one thing this
   * differs from the marketing boxes in, and it follows from the answer being
   * keyed per gamer rather than per account.
   */
  gamerPhotoConsents: ReadonlySet<GamerPhotoConsentType>;
  onGamerPhotoConsentChange: (
    consentType: GamerPhotoConsentType,
    granted: boolean,
  ) => void;
  /**
   * What the parent said about every photo box this panel asked, on the same
   * terms as the marketing answers above: one entry per row on screen, whatever
   * its value, and empty when the rows were not asked at all (a self seat, or a
   * product that asks nothing).
   */
  gamerPhotoConsentAnswers: readonly {
    consentType: GamerPhotoConsentType;
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
   * The photo consents this product asks about, off the same product read and
   * beside the product for the same reason the two sets above are: a shop card
   * never names what signing up would ask.
   */
  gamerPhotoConsentTypes: readonly GamerPhotoConsentType[],
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

  // Only participants the panel would actually accept are selectable — nobody
  // already on the product, and no child outside its age band. The default
  // falls to the first of those; a user pick of a now-locked row is ignored.
  // When every row is refused, this resolves to null and the CTA stays disabled
  // — the page still renders, the picker just shows each row's reason.
  //
  // **The two reasons are one list here on purpose.** The view draws them
  // differently (an already-enrolled row outranks an age-blocked one in the
  // label it shows), but selectability is indifferent to which refusal a row
  // carries, and preselecting a row the button would refuse is the bug either
  // one would produce.
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
      ? authState.participants.filter((p) => !p.signupState && !p.ageBlock)
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
  // The optional asks — marketing, and photos of a child
  //
  // **Every optional box starts unticked on every enrolment, and every box that
  // was asked is answered on submit.** One rule for both kinds, and it replaced
  // two different ones: the marketing boxes used to be seeded from the parent's
  // account and to send only what had moved.
  //
  // Why the seeding went. A seeded box is the platform pre-answering a question
  // it is putting to a parent, and the failure it produces is the one that
  // cannot be undone by explaining it: a parent glances at a ticked box, takes
  // it for something they did, and never learns that we decided for them. The
  // owner's call is that re-asking a question is cheaper than that, on every
  // enrolment, for every optional box on this panel. It also removes the read
  // the panel used to make, and with it the whole edit-outranks-a-late-seed
  // apparatus that existed only because that read landed after first paint.
  //
  // Why every asked box is now sent rather than only the moved ones. With
  // nothing seeded there is nothing to diff against, and the commonest answer
  // on the panel is a box left alone — which under the old rule sent nothing
  // and now sends the "no" it looks like. Both writers are idempotent and
  // append no event for a no-op, so re-stating an unchanged answer costs a
  // round trip and changes no record.
  //
  // A Map rather than a Set of ticked types in both cases, so the shape of the
  // state says what it holds: an explicit answer per box, `false` included.
  // ---------------------------------------------------------------------
  const [marketingEdits, setMarketingEdits] = useState<
    ReadonlyMap<MarketingConsentType, boolean>
  >(() => new Map<MarketingConsentType, boolean>());

  const marketingRows = describeMarketingConsents(marketingConsentTypes);
  const marketingValue = (consentType: MarketingConsentType) =>
    marketingEdits.get(consentType) ?? false;

  const marketingConsents = new Set(
    marketingRows.map((row) => row.type).filter(marketingValue),
  );
  // Only over the rows actually on screen. A stored type this deploy cannot
  // name is not rendered, so nobody answered it and nothing is sent about it.
  const marketingConsentAnswers = marketingRows.map((row) => ({
    consentType: row.type,
    granted: marketingValue(row.type),
  }));

  // The photo asks, which differ from the marketing asks in exactly one way:
  // **the answer belongs to a particular child**, so it does not survive the
  // parent selecting a different one.
  //
  // The reset is done by comparing during render rather than by clearing from
  // an effect — the same trick the consent stamps above use, and for the same
  // reason: an effect would leave one frame in which a tick made for Aino is on
  // screen beside Ville's name, and that frame is the one a fast click lands
  // in. Holding the participant the ticks were made for, and reading the map as
  // empty the moment it disagrees with the selection, keeps every frame
  // consistent.
  const [photoAnswers, setPhotoAnswers] = useState<{
    participantId: string | null;
    values: ReadonlyMap<GamerPhotoConsentType, boolean>;
  }>(() => ({
    participantId: null,
    values: new Map<GamerPhotoConsentType, boolean>(),
  }));

  const photoEdits =
    photoAnswers.participantId === selectedParticipantId
      ? photoAnswers.values
      : new Map<GamerPhotoConsentType, boolean>();

  // Answerable only about a child. A parent taking a seat on a product whose
  // audience admits adults is answering for themselves, and there is no gamer
  // for a photo answer to be keyed to — see the field's own note. The rows are
  // still on screen in both cases; they are simply disabled.
  const selectedIsSelf =
    authState.kind === "ready" &&
    authState.participants.find((p) => p.id === selectedParticipantId)
      ?.isSelf === true;
  const gamerPhotoConsentsEnabled =
    selectedParticipantId !== null && !selectedIsSelf;

  // The *answers*, which are a different question from the rows on screen: an
  // unanswerable box has no answer, so nothing is sent about it and nothing is
  // written for a seat that has no gamer behind it. This is what keeps the
  // submitted payload identical to what it was before the rows became
  // permanent — the disabled section contributes exactly nothing.
  const photoRows = gamerPhotoConsentsEnabled
    ? describeGamerPhotoConsents(gamerPhotoConsentTypes)
    : [];
  const photoValue = (consentType: GamerPhotoConsentType) =>
    photoEdits.get(consentType) ?? false;

  const gamerPhotoConsents = new Set(
    photoRows.map((row) => row.type).filter(photoValue),
  );
  const gamerPhotoConsentAnswers = photoRows.map((row) => ({
    consentType: row.type,
    granted: photoValue(row.type),
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
        // Recorded either way — an untick is an answer, not the absence of one.
        next.set(consentType, granted);
        return next;
      }),
    marketingConsentAnswers,
    gamerPhotoConsentTypes,
    gamerPhotoConsentsEnabled,
    gamerPhotoConsents,
    onGamerPhotoConsentChange: (consentType, granted) =>
      setPhotoAnswers((prev) => {
        // Stamped with the participant it was answered about, and built on the
        // previous map only when that participant has not changed — so a tick
        // made before a switch cannot survive into the answer given after it.
        const base =
          prev.participantId === selectedParticipantId
            ? prev.values
            : new Map<GamerPhotoConsentType, boolean>();
        const values = new Map(base);
        values.set(consentType, granted);
        return { participantId: selectedParticipantId, values };
      }),
    gamerPhotoConsentAnswers,
    currency,
    locale,
  };
}
