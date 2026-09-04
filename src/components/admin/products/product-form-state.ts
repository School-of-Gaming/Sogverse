import {
  DEFAULT_PRODUCT_TIMEZONE,
  type SupportedCurrency,
} from "@/lib/constants";
import type { SupportedLocale } from "@/lib/constants/locales";
import type { ProductTag, ProductTopic, SpokenLanguageCode } from "@/types";
import type { AttachableMarketingConsentType } from "@/lib/constants/marketing-consents";
import { effectiveBillingMode } from "./product-type-config";
import type {
  PaidMode,
  ProductTypeConfig,
  StartMode,
} from "./product-type-config";
import type { ScheduleSlotDraft } from "./schedule-slots-editor";

// Module-level constants — listed here rather than inline so the lint rule
// against literal strings (i18n) doesn't fire for these structural keys.
// (The free/paid chooser's tuple is the one exception: it lives in
// product-type-config.ts alongside the derivation that reads it.)
export const REGISTRATION_OPENS_MODE_VALUES = [
  "immediately",
  "scheduled",
] as const;
// Seat-limit chooser values. "limited" pairs with a seat-count input;
// "unlimited" means no seat cap (seat_count = null). Maps to the `uncapped`
// boolean: unlimited ⇔ uncapped. Offered for every type but municipality clubs
// — see `offersUncapped`.
export const SEAT_LIMIT_MODE_VALUES = ["limited", "unlimited"] as const;
// End-date chooser values for consumer clubs (the only ongoing type). "ongoing"
// means no end date (end_date = null); "dated" pairs with a date input. Maps to
// the `hasEndDate` boolean: dated ⇔ hasEndDate. A mutually-exclusive radio
// instead of a "leave blank for ongoing" date input — Safari's native date
// field won't accept an empty value, so "blank means ongoing" wasn't reachable.
export const END_DATE_MODE_VALUES = ["ongoing", "dated"] as const;

// Per-session fee selectors. Each fee is one EUR amount the DB stores as
// integer cents, with state DERIVED from the value (null = unknown/none,
// 0 = volunteer, > 0 = fee). The form makes the human pick that state
// explicitly — a select, never an empty box or a typed 0 — so these are the
// allowed select values per fee. The amount input only shows for "fee".
//   primary gedu:  unknown | volunteer | fee   (default unknown; always shown)
//   assistant:     none    | volunteer | fee   (default none; always shown)
//   municipality:  unknown | fee               (default unknown; muni clubs only)
export const PRIMARY_GEDU_FEE_STATUS_VALUES = [
  "unknown",
  "volunteer",
  "fee",
] as const;
export const ASSISTANT_GEDU_FEE_STATUS_VALUES = [
  "none",
  "volunteer",
  "fee",
] as const;
export const MUNICIPALITY_FEE_STATUS_VALUES = ["unknown", "fee"] as const;

export type PrimaryGeduFeeStatus =
  (typeof PRIMARY_GEDU_FEE_STATUS_VALUES)[number];
export type AssistantGeduFeeStatus =
  (typeof ASSISTANT_GEDU_FEE_STATUS_VALUES)[number];
export type MunicipalityFeeStatus =
  (typeof MUNICIPALITY_FEE_STATUS_VALUES)[number];

// A fee's form state: the chosen status plus the decimal-string amount, which
// is only meaningful (and only collected) when status is "fee".
export type FeeDraft<S> = { status: S; amount: string };

// The time picker's grid, shared by the schedule-slots editor and the
// registration-opens field. It is a pair of selects rather than a native
// <input type="time"> for two reasons that both still hold: Chrome's native
// picker ignores `step` in its dropdown, so it cannot express a grid at all,
// and admins told us free entry of any minute gave them more choice than was
// useful. What did not hold was the quarter-hour step — real club times are not
// all quarter-hour aligned (a school slot starting at 14:20), and a time the
// picker cannot offer is worse than a longer list: a select whose value matches
// no option shows the admin the first one while state holds something else, so
// an off-grid product read as :00 and "correcting" it wrote a different time.
export const MINUTE_STEP = 5;

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0"),
);
export const MINUTE_OPTIONS = Array.from(
  { length: 60 / MINUTE_STEP },
  (_, i) => String(i * MINUTE_STEP).padStart(2, "0"),
);

export type RegistrationOpensMode =
  (typeof REGISTRATION_OPENS_MODE_VALUES)[number];
export type SeatLimitMode = (typeof SEAT_LIMIT_MODE_VALUES)[number];

// Per-locale draft. `shortDescription` is the required teaser (the old single
// `description`); `longDescription` is the optional marketing blurb, authored
// as markdown in the rich-text editor. A blank `longDescription` means "no long
// description" and submits as SQL NULL — the column's CHECK refuses an empty
// string, so the payload builder folds one rather than sending it.
export type TranslationDraft = {
  name: string;
  shortDescription: string;
  longDescription: string;
};

export interface FormState {
  // Per-locale name + descriptions. Admin starts with one tab (their UI locale)
  // and can add more. Submission writes one product_translations row per
  // locale present in this map. At least one filled locale is required (any).
  translations: Partial<Record<SupportedLocale, TranslationDraft>>;
  activeLocale: SupportedLocale;

  // Identity (non-translated). `topic` is the fixed product_topic enum; ""
  // is the unselected state the create form starts in.
  topic: ProductTopic | "";
  // Lesson material for whoever teaches this product. Staff-facing: it is
  // rendered in the gedu group workspace and on no family surface at all.
  materialUrl: string;
  // The catalogue entry this product's picture comes from, or null for no
  // picture. An **id and nothing else**: the entry's label and the picture
  // itself are derived, never held here — at load from the admin detail read's
  // `product_images` embed, and after that from whatever the catalogue surface
  // last saw. Holding a copy is what would let a rename or a replace made
  // elsewhere leave a stale label sitting in a half-filled form.
  imageId: string | null;

  // Audience
  //
  // Who may occupy a seat, edited as the Audience section's checkbox pair. Both
  // flags are loaded and sent back on every save because the update RPC assigns
  // every editable column on every call: a product's audience has to survive an
  // edit that was about something else, and the only way it can is by riding in
  // state. Hardcoding the defaults in the payload builder instead would reset
  // every product an admin so much as renamed.
  forGamers: boolean;
  forParents: boolean;
  // The gamer audience's age range, as typed. Blank means "no range" and reaches
  // the database as NULL — which is legal exactly when `forGamers` is false, so
  // the payload builder derives the pair from the flag rather than copying it.
  // Unticking For gamers hides the fields without emptying them, so a mis-click
  // costs nothing for as long as the form stays open.
  minAge: string;
  maxAge: string;
  // Who the product was *designed* for, as the one optional badge families see
  // on the shop card and detail page. A different question from the audience
  // flags above — an audience says who may hold the seat, a tag says who the
  // sessions were built for — which is why it sits beside them rather than in
  // its own section. `null` is untagged: the default on create, the ordinary
  // stored state, and the value that renders nothing anywhere.
  //
  // Freely editable for the product's whole life: the picker deliberately takes
  // no part in the form-lock machinery, because retagging a running club has no
  // consequence for anyone already enrolled.
  tag: ProductTag | null;
  // The one country whose families may enrol, as an ISO 3166-1 alpha-2 code, or
  // `null` for no lock — the default and the ordinary state. Sits beside the
  // audience because it narrows the same question (who may take a seat) and not
  // the "Where" fields, which say where the product runs: a fully remote club is
  // as lockable as an in-person one.
  //
  // Offered only for types whose config sets `regionLockable`, which excludes
  // municipality clubs — their country is settled by the separate `countryBound`
  // mechanism. Freely editable for a product's whole life, live ones included,
  // because the lock gates future enrolments and never revisits a held seat, and
  // enforced by the shop UI alone (a family's location is self-attested).
  regionLockCountry: string | null;
  // The spoken_language enum, with the same `""` unselected sentinel `topic`
  // above uses — a new product starts with no language chosen, and validate()
  // is what turns that into an error rather than a silent default.
  spokenLanguageCode: SpokenLanguageCode | "";

  // Where
  isRemote: boolean;
  locationId: string | null;

  // When
  //
  // The IANA zone every wall clock on this form is entered in — the schedule
  // slots and the scheduled registration drop alike. It is a real field rather
  // than a constant because a product's sessions happen where the product does,
  // and the platform now runs in four countries; it stays editable on the edit
  // form because the schedule is stored as wall clock, so changing it re-resolves
  // every session to that same clock face in the new zone, which is exactly the
  // correction an admin who picked the wrong zone needs.
  timezone: string;
  startMode: StartMode;
  startDate: string;
  // Whether a consumer club has a fixed end date. `false` ⇒ ongoing (end_date
  // null), `endDate` is ignored. Only the consumer-club form surfaces this
  // choice; other types always require an end date, so the flag is unused for
  // them. See END_DATE_MODE_VALUES.
  hasEndDate: boolean;
  endDate: string;
  scheduleSlots: ScheduleSlotDraft[];
  signupThreshold: string;

  // Capacity & billing
  paidMode: PaidMode;
  // Per-currency price map. The platform is EUR-only (see
  // src/lib/constants/currency.ts), so this currently holds a single `eur`
  // row — the shape is kept currency-keyed so re-enabling currencies is a
  // matter of widening SUPPORTED_CURRENCIES, not reshaping form state.
  prices: Record<SupportedCurrency, { session: string; month: string }>;
  seatCount: string;
  uncapped: boolean;
  waitlistEnabled: boolean;

  // Per-session operating fees. `municipalityFee` is only surfaced for
  // municipality clubs; for other types it's kept at its default and forced
  // to null at build time (the DB CHECK rejects a muni fee on a non-muni
  // product).
  primaryGeduFee: FeeDraft<PrimaryGeduFeeStatus>;
  assistantGeduFee: FeeDraft<AssistantGeduFeeStatus>;
  municipalityFee: FeeDraft<MunicipalityFeeStatus>;

  // Registration timing — `immediately` accepts signups as soon as the
  // product is published; `scheduled` opens at the picked date+time, read as a
  // wall clock in the product's own `timezone` above. The date/hour/minute
  // fields are kept around even when mode is `immediately` so toggling back
  // doesn't lose what was typed.
  registrationOpensMode: RegistrationOpensMode;
  registrationOpensDate: string;
  registrationOpensHour: string;
  registrationOpensMinute: string;

  // Required consents
  //
  // The consent documents a parent must agree to before enrolling, as the slugs
  // of `consent_documents` rows. A Set because the control is a list of
  // independent checkboxes and the payload builder flattens it with
  // `Array.from`.
  //
  // Offered on every product type, deliberately: the mechanism is generic — a
  // product requires whichever published documents it requires — and a per-type
  // flag would be inventing a rule the database does not have. Empty is the
  // ordinary state and the default.
  requiredConsentSlugs: Set<string>;

  // Optional marketing asks
  //
  // The marketing consents this product's signup panel ASKS a parent about,
  // as `marketing_consent_type` values. A Set for the same reason the slugs
  // above are one, and — despite looking like the same field — a completely
  // different kind of answer: a row here never blocks an enrolment, and the
  // consent it names is account-level and revocable from settings, whereas a
  // required document is a per-seat, non-revocable condition. Empty on almost
  // every product and the default.
  // Narrowed to the types a form can actually offer rather than to the whole
  // enum: `school_of_gaming` is asked at registration and belongs to no
  // product, so a state that could hold it would be a state no screen can show.
  marketingConsentTypes: Set<AttachableMarketingConsentType>;

  // Does every member of this product owe a creation — a link to the thing
  // they made — by the time it ends? An admin decision, never derived from
  // `topic`: not every Roblox-Studio product is sponsored, and the obligation
  // comes from a contract rather than from the subject matter.
  //
  // Staff-facing in every direction: a family sees nothing different on a
  // flagged product, and no family document carries the column. What the flag
  // changes is *signals* — the final session's completeness gains a fourth
  // condition — never the authoring surface, which is the same on every
  // product.
  //
  // Round-tripped from state on every save like the audience pair above,
  // because `update_product` assigns every editable column on every call and
  // the parameter defaults to FALSE: an omitted answer would unflag the
  // product rather than preserve it.
  requiresGamerCreations: boolean;

  // Visibility
  isVisible: boolean;
}

function defaultSlots(config: ProductTypeConfig): ScheduleSlotDraft[] {
  if (config.scheduleShape === "multi_day_bounded") {
    return [
      { weekday: 0, start_time: "10:00", duration_minutes: 180 },
      { weekday: 2, start_time: "10:00", duration_minutes: 180 },
      { weekday: 4, start_time: "10:00", duration_minutes: 180 },
    ];
  }
  if (config.scheduleShape === "single_date") {
    return [{ weekday: 0, start_time: "18:00", duration_minutes: 90 }];
  }
  return [{ weekday: 1, start_time: "16:00", duration_minutes: 90 }];
}

export function initialState(
  config: ProductTypeConfig,
  uiLocale: SupportedLocale,
): FormState {
  // The type's own default billing mode, folded into the form's free/paid
  // chooser. Events start free; clubs and camps start paid; municipality clubs
  // have no choice to make and the pick is ignored for them.
  const initialPaidMode = defaultPaidMode(config);
  const startsCapped = capacityDefaultsToCapped(config, initialPaidMode);
  return {
    translations: {
      [uiLocale]: { name: "", shortDescription: "", longDescription: "" },
    },
    activeLocale: uiLocale,
    topic: "",
    materialUrl: "",
    imageId: null,
    // A new product is for children until somebody says otherwise — the shape
    // every product has today, and the only one the form can currently express.
    forGamers: true,
    forParents: false,
    minAge: "7",
    maxAge: "12",
    // Untagged until somebody decides otherwise. There is no sensible default
    // design tag — a wrong one advertises a promise to families we did not make.
    tag: null,
    // Unlocked until somebody decides otherwise. A default lock would quietly
    // hide a new product from every family outside one country.
    regionLockCountry: null,
    spokenLanguageCode: "",
    isRemote: true,
    locationId: null,
    // Finland unless the admin says otherwise — most of what we run is Finnish,
    // and every product that predates the picker carries this zone.
    timezone: DEFAULT_PRODUCT_TIMEZONE,
    startMode: config.allowedStartModes[0],
    // Blank on every type, consumer clubs included: a club may now start on a
    // future date (billing defers to it), so there is no safe date to pin and
    // `startDateRequired` makes the admin choose one.
    startDate: "",
    hasEndDate: false,
    endDate: "",
    scheduleSlots: defaultSlots(config),
    signupThreshold: "",
    paidMode: initialPaidMode,
    prices: {
      eur: { session: "", month: "" },
    },
    // Always blank — there's no sensible default capacity. An admin who opts
    // into a seat cap must type the real number; nothing to skip past.
    seatCount: "",
    // Fees start in their "not yet known" state so the admin product list
    // alerts until they're filled (primary gedu + muni). Assistant defaults to
    // "none" — an assistant educator is the exception, not the norm.
    primaryGeduFee: { status: "unknown", amount: "" },
    assistantGeduFee: { status: "none", amount: "" },
    municipalityFee: { status: "unknown", amount: "" },
    // Capacity defaults — see `capacityDefaultsToCapped` for who caps and why.
    uncapped: !startsCapped,
    // The waitlist only exists behind a cap, so it follows the same answer.
    waitlistEnabled: startsCapped,
    registrationOpensMode: "immediately",
    registrationOpensDate: "",
    registrationOpensHour: "10",
    registrationOpensMinute: "00",
    // Nothing required until somebody says otherwise. A default requirement
    // would put a legal condition in front of families nobody decided to ask.
    requiredConsentSlugs: new Set(),
    // Nothing asked until somebody says otherwise. A default ask would put a
    // partner's marketing question in front of families nobody decided to ask.
    marketingConsentTypes: new Set(),
    // Nothing owed until somebody says otherwise. The obligation comes from a
    // sponsor's contract, so it is stated per product rather than defaulted —
    // and false being the resting state is what makes flagging the opt-in.
    requiresGamerCreations: false,
    isVisible: false,
  };
}

// ===== Derivations =====
//
// Multi-line and/or used by both the parent (validate/submit) and individual
// section components. Single-line booleans like `usesDate` are derived inline
// where they're consumed.

export function effectivePricingShape(
  config: ProductTypeConfig,
): "monthly" | "upfront_total" {
  return config.pricingShape === "monthly" ? "monthly" : "upfront_total";
}

// ===== Capacity =====
//
// Three rules, all keyed to the money rather than the product type, because
// what a cap *means* is keyed to the money: on a no-charge signup the RPC
// validates the cap and writes the seat in one locked transaction, so the cap
// is hard; on a paid one the seat arrives with the payment, so the cap is soft
// and deliberately opt-in.

/** The free/paid pick a brand-new product of this type starts on. */
export function defaultPaidMode(config: ProductTypeConfig): PaidMode {
  return config.defaultBillingMode === "free" ? "free" : "paid";
}

/**
 * Whether "no seat limit" is on offer at all. Municipality clubs are contracted
 * for a specific number of places, so they are the one type where it is not:
 * their form drops the chooser and asks for the number outright.
 *
 * `initialState` and `existingFormState` both pin `uncapped` to false for them,
 * so the rest of the form (which reads the flag, not the type) needs no second
 * special case — and a stored uncapped muni row heals on its next save, with
 * validation demanding the number before the payload is built.
 */
export function offersUncapped(config: ProductTypeConfig): boolean {
  return config.productType !== "municipality_club";
}

/**
 * Whether a fresh product starts capped. Municipality clubs must be (above),
 * and **no-charge products default to it** so "forgot to cap" cannot happen:
 * the admin either types a number or actively picks "no seat limit". Paid
 * products default uncapped — a soft cap is a deliberate choice, not something
 * to opt out of.
 */
export function capacityDefaultsToCapped(
  config: ProductTypeConfig,
  paidMode: PaidMode,
): boolean {
  if (!offersUncapped(config)) return true;
  return effectiveBillingMode(config, paidMode) === "free";
}

/**
 * Apply a free/paid change to the whole form state, capacity included.
 *
 * Flipping **to free** turns the cap on if the form is currently uncapped —
 * same "cannot forget" rule the initial state applies, arriving at the same
 * place by a different route — and takes the waitlist to its free default of
 * on. Flipping **to paid** leaves capacity entirely alone: caps and waitlists
 * are legal on both sides, so there is nothing to clear.
 *
 * Neither direction touches a seat count the admin already typed. That matters
 * most on the edit form, where flipping a capped paid product to free must keep
 * its stored cap rather than blanking it and demanding the number again.
 */
export function withPaidMode(state: FormState, paidMode: PaidMode): FormState {
  if (paidMode !== "free" || !state.uncapped) return { ...state, paidMode };
  return { ...state, paidMode, uncapped: false, waitlistEnabled: true };
}

export function startModeUsesDate(mode: StartMode): boolean {
  return mode === "date" || mode === "date_and_threshold";
}

export function startModeUsesThreshold(mode: StartMode): boolean {
  return mode === "threshold" || mode === "date_and_threshold";
}

export function locationPickerMode(
  config: ProductTypeConfig,
  isRemote: boolean,
): "site" | "municipality" | null {
  // Online products only need a location picker for municipality clubs
  // (they anchor to the funding municipality). In-person products always
  // pick a site.
  if (isRemote) {
    return config.requiresMunicipalityWhenOnline ? "municipality" : null;
  }
  return "site";
}
