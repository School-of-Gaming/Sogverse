"use client";

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { formatInTimeZone } from "date-fns-tz";
import { useNow, useTimezone } from "@/providers";
import {
  ageOnDate,
  gamerAgeBlock,
  type GamerAgeBlock,
} from "@/lib/gamer-age-eligibility";
import { useAuth } from "@/providers/auth-provider";
import { useLocationsByIds } from "@/services/locations";
import { useProductDetail } from "@/services/products";
import { useGamerBirthDates, useMyGamers } from "@/services/gamers";
import {
  useParticipationCounts,
  useProductSeatCountsRealtime,
} from "@/services/participations";
import {
  deriveRegistrationState,
  registrationCtaKind,
} from "./derive-registration-state";
import { DETAIL_BAND_CLASS, DETAIL_GRID_CLASS } from "./detail-grid";
import { ProductDetailPageBody } from "./product-detail-page-body";
import { audienceAdmitsRole, productAudience } from "@/lib/products/product-audience";
import { resolveRegionGate, type RegionGate } from "./region-lock/region-gate";
import { SignupPanel } from "./signup-panel";
import type {
  AuthState,
  ConfirmedHomeLocation,
  SignupAgeBlock,
} from "./signup-panel-view";

// Route-level adapter: fetches the product, resolves the auth state
// (signed-in customer with gamers / customer with no gamers / non-
// customer / unauthenticated), and forwards everything to the body.
// The body itself is data-only (no fetching) so the mockup preview
// route can render it directly with fixture data.

/**
 * The map a failed birth-date read resolves to: no ages, and so nothing
 * blocked — the same answer a roster whose children have no stored birth date
 * gets. Module-level so its identity is stable across renders; a fresh `Map`
 * each render would be a new one for no reason.
 */
const NO_BIRTH_DATES: ReadonlyMap<string, string | null> = new Map();

interface ProductDetailPageProps {
  productId: string;
  /**
   * The `/schools/<slug>` listing this detail page was opened from (the
   * `/schools/<slug>/[id]` route), as the slug that appeared in the URL.
   * Redirects the back link to that municipality instead of the storefront.
   * Omitted on `/shop/[id]`.
   *
   * The **slug only** — the label's municipality name is resolved from the
   * product row downstream, so nothing has to look the slug up. The URL's slug
   * is what builds the href, deliberately: a viewer who followed
   * `/schools/helsingfors` stays in that namespace rather than being bounced to
   * the canonical `helsinki`.
   */
  municipalitySlug?: string;
}

export function ProductDetailPage({
  productId,
  municipalitySlug,
}: ProductDetailPageProps) {
  const pathname = usePathname();
  // The **raw external** pathname, embedded in a URL rather than compared
  // against a route — so it comes from `next/navigation`'s own `usePathname`
  // (see the import comment) and is carried as the href object's query, which
  // the wrapped `Link` encodes.
  const redirectQuery = { redirect: pathname };
  // The viewer's own locale, for the one string on this page built from a
  // database row rather than a message file: the home location's name.
  //
  // Through `resolveLocale`, because the other half of that name's precedence
  // rule already is: the name of a place confirmed in the panel's dialog is
  // resolved against the panel's own locale, which is a resolved one. Two
  // spellings of the same location, differing only in which side answered
  // first, is the bug a raw locale here would produce.
  const locale = resolveLocale(useLocale());

  const { user, profile, isLoading: authLoading } = useAuth();
  const isCustomer = profile?.role === "customer";

  // Ticking clock (30s), server-seeded so SSR and the first client render
  // agree — same source the browse card derives its state from. An event's
  // registration closes at the instant its session ends, which can land while
  // this page is open; a one-shot `new Date()` would leave a stale signup
  // panel up until the visitor reloaded.
  const now = useNow();

  // The viewer's own zone, and today's calendar date in it. **One string feeds
  // both halves of the age band** — the pill beside a child's name and the
  // block that refuses their row — because the two are the same fact stated
  // twice and a midnight rollover between two readings of the clock would have
  // them disagree in front of the parent. So the zone is resolved once, the
  // date is derived once, and both go through the age helper as digits: a bare
  // calendar date belongs to somebody's zone and a pure helper has no way to
  // know whose. Never `toISOString().slice(0, 10)` — that is the date in UTC,
  // which is a day out for half the world at the wrong hour, and here it would
  // be a day out at exactly the boundary this is about: a child's birthday.
  // Off the shared server-seeded clock rather than a bare `new Date()`, so the
  // server render and the first client render cannot disagree about what day
  // it is.
  const timeZone = useTimezone();
  const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");

  const { data: product, isLoading: productLoading, isError } =
    useProductDetail(productId);

  const { data: gamers, isLoading: gamersLoading } = useMyGamers({
    enabled: isCustomer,
  });

  // ---------------------------------------------------------------------
  // How old each child is, for the picker
  //
  // `get_my_gamers` returns `profiles` rows and a birth date is not one of
  // them, so the age the picker prints beside a name — and the age band it
  // refuses a row on — takes a second keyed read against `gamer_profiles`,
  // scoped to this parent's own children by RLS.
  //
  // **It is asked only where its answer is used**: a product with no gamer
  // audience has no child rows to describe and no age band to enforce, so it
  // asks nothing rather than reading a roster it will not paint. That leaves
  // the ids waiting on the product read, which makes this the one read on the
  // page that cannot start in parallel with the others — and the wait below is
  // what pays for that rather than the parent doing so, because the alternative
  // is a picker that paints a child as selectable and then disables the row
  // under a cursor already on it.
  // ---------------------------------------------------------------------
  const ageBandApplies = isCustomer && product?.for_gamers === true;
  // Memoised so a re-render hands the hook the same array it had last time —
  // the ids are what its cache key and its enabled flag are built from.
  const rosterIds = useMemo(
    () => (ageBandApplies ? (gamers ?? []).map((g) => g.id) : undefined),
    [ageBandApplies, gamers],
  );
  const {
    map: birthDatesRead,
    isPending: birthDatesNeverResolved,
    failureCount: birthDateFailures,
  } = useGamerBirthDates(rosterIds);

  // **The fail-open is latched, exactly as the home-location read's is** — see
  // the block below it, which states the reasoning in full. Same shape, same
  // reason: sampled per render, a failure that a retry or a focus refetch later
  // turned into a success would insert age pills beside names already on screen
  // and flip rows from enabled to disabled under a parent's cursor, which is a
  // change on data's own schedule. So the first failed attempt is remembered
  // for the life of the mount and the page settles on "no ages, nothing
  // blocked" — the same answer a roster with no stored birth dates gets, which
  // is the honest one when we cannot read them.
  const [birthDatesEverFailed, setBirthDatesEverFailed] = useState(false);
  const birthDatesReadFailed = birthDatesEverFailed || birthDateFailures > 0;
  if (birthDatesReadFailed && !birthDatesEverFailed) {
    setBirthDatesEverFailed(true);
  }
  const birthDates = birthDatesReadFailed ? NO_BIRTH_DATES : birthDatesRead;

  const { data: counts, isLoading: countsLoading } = useParticipationCounts(
    product ? [product.id] : [],
  );
  const myCount = counts?.[0];

  // ---------------------------------------------------------------------
  // Where the family lives, for the region lock
  //
  // A locked product is sold in one country, and the family's is the country of
  // the `locations` row their profile points at — the same keyed read the
  // settings field resolves its stored pick with. It is fired for any signed-in
  // parent who has a location, not only on a locked product, so it runs in
  // parallel with the three reads below instead of waiting to learn whether it
  // is needed: it is one row by primary key and lands with them.
  //
  // The place a parent confirms in the panel's dialog is held here for the gap
  // between the write and the read of the row it points at — see the gate
  // below. It carries the resolved name as well as the country, because the
  // panel says both back and neither is on the profile yet.
  // ---------------------------------------------------------------------
  const homeLocationId = isCustomer ? profile.home_location_id : null;
  const {
    data: homeLocationRows,
    isLoading: homeLocationLoading,
    failureCount: homeLocationFailures,
  } = useLocationsByIds(homeLocationId ? [homeLocationId] : []);
  const [confirmedLocation, setConfirmedLocation] = useState<
    ConfirmedHomeLocation | undefined
  >(undefined);

  // ---------------------------------------------------------------------
  // **The fail-open is latched, not sampled.**
  //
  // The gate fails open when that read cannot answer — but "cannot answer" has
  // to be a fact about this *mount*, not about this render. Sampled per render
  // it is neither: React Query retries a failure for several seconds and
  // refetches on window focus, so the honest sequence is "read fails → panel
  // paints the whole form → parent picks a child and ticks the rules → a focus
  // refetch succeeds → the gate flips to wrong_country and the form they were
  // filling in is replaced by a refusal". That is a panel swap on data's own
  // schedule, which the layout rules forbid outright, and it destroys work the
  // reader had already done.
  //
  // So the first failed attempt is remembered for the life of the mount. Once
  // this page has resolved the gate *without* the read, a late answer cannot
  // rewrite it; the parent gets one panel and keeps it. A reload is what
  // re-asks the question, which is the right granularity — it is also a fresh
  // panel with nothing half-filled in it.
  //
  // `failureCount` rather than `isError`: `isError` waits for the last retry,
  // and this page has already stopped waiting at the first failure (see the
  // skeleton gate below). The two have to agree, or the page paints a form on
  // the strength of a read it then keeps listening to.
  //
  // State rather than a ref, because this *is* rendering input — it decides
  // which panel the reader gets. The live failure is OR-ed in beside it so the
  // very render that first sees one already fails open; the state exists only
  // to keep that answer once `failureCount` resets under a later success.
  // ---------------------------------------------------------------------
  const [homeLocationEverFailed, setHomeLocationEverFailed] = useState(false);
  const homeLocationReadFailed =
    homeLocationEverFailed || homeLocationFailures > 0;
  if (homeLocationReadFailed && !homeLocationEverFailed) {
    // React's own "adjusting state during render" shape, not an effect: the
    // latch is a fact about a value this render already holds, and React
    // discards this pass and re-renders before painting, so nothing is ever
    // shown on the un-latched value. An effect would set it a paint later,
    // which is a cascading render for no gain — the OR above has already made
    // this render correct.
    setHomeLocationEverFailed(true);
  }

  // Live seat-count updates for this single product. Browse pages don't
  // subscribe per-card (a 30-card grid is too many channels) — detail page
  // is the only realtime subscriber. Per CLAUDE.md the callback only
  // invalidates queries; never run a Supabase data query inside it.
  useProductSeatCountsRealtime(product?.id);

  // Wait on every query the signup panel depends on before painting, so we
  // don't show a child as selectable and then snap them to a disabled
  // "Signed up" row a tick later. countsLoading carries `myGamerStates`
  // (the per-child already-enrolled signal); the birth dates carry the other
  // per-child reason a row can be refused, the product's age band, and are
  // waited on for exactly the same reason — an age landing after paint would
  // both insert the age pill beside a name already on screen and flip its row
  // from enabled to disabled.
  //
  // **That wait is "until the read has resolved once", not "whenever it is not
  // resolved".** The birth-date query is keyed on the roster's ids, and the
  // roster grows while this page is open: a parent adds a child in the panel's
  // own dialog, the create invalidates the roster key, the ids change, and the
  // birth-date query re-keys. Were the gate a live "is it pending" this page
  // would drop back to its skeleton at that moment and unmount the panel —
  // taking every ticked box with it, and the preselection the dialog had just
  // handed the new child. The hook keeps the previous map across a re-key
  // precisely so this never returns to pending, and the flag read here is
  // first-resolution only. It also fails open on the read's first failed
  // attempt, on the same terms the location read below does.
  //
  // For non-customers the
  // customer-only queries return fast/empty. Gedus assigned to a product reach
  // the gedu session-details page from /gedu/clubs/[id] (or /camps/[id] /
  // /events/[id]) — the marketing route here shows them the public layout with
  // a non_customer overlay, which is the right thing for an enrolment-style URL.
  //
  // The region lock joins that list, and only where it can change what the
  // panel says: a locked product, a signed-in parent, a location stored to
  // resolve. The panel must never paint one answer and then the other — a form
  // that turns into "not sold here", or a refusal that turns into a form — so
  // the page waits for the country instead of guessing at it. Nobody else waits
  // for this: an unlocked product, a visitor, and a parent with no location at
  // all are all already decided. Nor does the wait return once the page is up —
  // a parent confirming a place in the panel's dialog hands the country
  // straight to `confirmedLocation`, so the read that follows has nothing left
  // to tell us.
  //
  // **And the wait ends at the first failed attempt, not at the last retry.**
  // `isLoading` is `isPending && isFetching`, which stays true across React
  // Query's whole retry window, and `isError` only turns over once the last
  // retry is spent — so gating on `isError` holds the entire page in skeleton
  // for the several seconds the gate was never going to wait for anyway. One
  // failure is enough to know this read is not going to answer in time:
  // `failureCount` turns over immediately, the page paints, and the gate takes
  // its fail-open branch — which the latch above then makes permanent, so
  // nothing arrives later to contradict what the parent is looking at.
  if (
    productLoading ||
    authLoading ||
    (isCustomer && gamersLoading) ||
    (isCustomer && birthDatesNeverResolved && !birthDatesReadFailed) ||
    (isCustomer && countsLoading) ||
    (isCustomer &&
      product?.region_lock_country != null &&
      homeLocationId !== null &&
      confirmedLocation === undefined &&
      !homeLocationReadFailed &&
      homeLocationLoading)
  ) {
    return <DetailLoadingSkeleton />;
  }

  if (isError || !product) {
    return <DetailNotFound />;
  }

  const authState: AuthState = (() => {
    if (!user) {
      return {
        kind: "unauthenticated",
        signInHref: { pathname: ROUTES.login, query: redirectQuery },
        createAccountHref: { pathname: ROUTES.register, query: redirectQuery },
      };
    }
    // `profile` is re-tested rather than leaning on `isCustomer`: the parent's
    // own row is built from it, so the narrowing has to be one the compiler
    // can see.
    if (!profile || profile.role !== "customer") {
      return { kind: "non_customer" };
    }
    // A signed-in customer is always "ready" — even with zero gamers. The
    // picker renders whatever participants exist (possibly none) and the CTA
    // stays disabled until one is selected, so the no-gamers case needs no
    // separate state. Each row carries its own signup state (active /
    // waitlisted) so the picker can disable an already-enrolled one in place.
    //
    // **This is where the three audience cases decide which rows exist**, and
    // the whole of the difference is which rows go into the array. The rule is
    // `audienceAdmitsRole` — the same predicate the admin picker offers seats
    // by — so "who may hold a seat" has one home and the two surfaces cannot
    // drift:
    //
    //   gamers-only  — the children, exactly as before.
    //   parents-only — the reader alone, so the hook's "first selectable row"
    //                  preselects them and the seat is explicit before paying.
    //   both         — the children, then the reader beneath them, matching the
    //                  order their dashboard puts them in. One selection, one
    //                  seat, one checkout.
    //
    // Everything downstream is id-agnostic. In particular the already-enrolled
    // lockout needs no work at all: `myGamerStates` is built from the rows where
    // `customer_id` is the reader, keyed on the participant column, so a self
    // seat is already filed under the reader's own id.
    const audience = productAudience(product);
    const participantStates = myCount?.myGamerStates ?? {};
    // A child's age and their eligibility come off the same stored birth date,
    // and both are absent together when the row has none — a gamer profile
    // with no birth date shows no age pill and is refused by nothing, which is
    // the honest answer rather than a guess in either direction.
    const gamerRows = audienceAdmitsRole(audience, "gamer")
      ? (gamers ?? []).map((g) => {
          const dateOfBirth = birthDates.get(g.id) ?? null;
          return {
            id: g.id,
            name: g.first_name,
            age: dateOfBirth === null ? null : ageOnDate(dateOfBirth, today),
            ageBlock:
              dateOfBirth === null
                ? null
                : describeAgeBlock(
                    gamerAgeBlock({
                      minAge: product.min_age,
                      maxAge: product.max_age,
                      dateOfBirth,
                      today,
                      startDate: product.start_date,
                    }),
                    product,
                  ),
            signupState: participantStates[g.id] ?? null,
          };
        })
      : [];
    const selfRow = audienceAdmitsRole(audience, "customer")
      ? [
          {
            id: user.id,
            name: profile.first_name,
            // Ages belong to the gamer audience and never to adults — a parent
            // row deliberately shows no age pill.
            age: null,
            signupState: participantStates[user.id] ?? null,
            isSelf: true,
          },
        ]
      : [];
    return {
      kind: "ready",
      participants: [...gamerRows, ...selfRow],
      // The account's children, never the picker's rows: counting the injected
      // parent would hide the add-a-child affordance one child early. It is
      // also the full roster including children already on this product, which
      // is the number the Steven Brown cap is about.
      gamerCount: (gamers ?? []).length,
    };
  })();

  // Seats are held by active participations alone — the seat-left pill and the
  // threshold check both read that one number, and so does the capacity gate in
  // the database. A parent part-way through Stripe Checkout holds no seat.
  const participationsCount = myCount?.activeCount ?? 0;

  const state = deriveRegistrationState({
    product,
    now,
    participationsCount,
  });

  const homeLocationRow = homeLocationRows?.[0] ?? null;

  // The lock, against where this family says it lives. A visitor and a
  // wrong-role viewer are handed `unlocked` rather than checked: they meet an
  // overlay of their own first, and telling them where the product is sold
  // answers a question they have not reached. The confirmed pick outranks the
  // read for as long as both are in play; they agree the moment the read lands.
  //
  // Precedence and the two fail-open cases both live in `resolveRegionGate`, so
  // the rule can be tested without a page around it. All this end owes it is an
  // honest account of what the reads returned — in particular the difference
  // between no row at all (undefined) and a row carrying no country (null),
  // which is the difference between asking the family where they live and
  // deciding not to.
  const regionGate: RegionGate =
    authState.kind === "ready"
      ? resolveRegionGate({
          regionLockCountry: product.region_lock_country,
          confirmedCountry: confirmedLocation?.countryCode,
          homeLocationReadFailed,
          homeLocationCountry:
            homeLocationRow === null ? undefined : homeLocationRow.country_code,
        })
      : { kind: "unlocked" };

  return (
    <ProductDetailPageBody
      product={product}
      municipalitySlug={municipalitySlug}
      signupPanel={
        <SignupPanel
          product={product}
          // Off the detail query's own embed, which is the only read that has
          // it: the browse row deliberately does not publish a product's
          // enrolment conditions, so the panel takes them beside the product
          // rather than off it.
          requiredConsentSlugs={product.product_required_consents.map(
            (consent) => consent.document_slug,
          )}
          // The other embed on the same read, and the same reasoning: what a
          // product asks at signup is not on the browse row, because a card
          // never names it.
          marketingConsentTypes={product.product_marketing_consents.map(
            (consent) => consent.consent_type,
          )}
          // The third embed on the same read, same reasoning again: what a
          // product asks about a child's photograph is not on the browse row.
          gamerPhotoConsentTypes={product.product_gamer_photo_consents.map(
            (consent) => consent.consent_type,
          )}
          state={state}
          authState={authState}
          regionGate={regionGate}
          // Only the `eligible` variant reads it, and only the confirmed pick
          // can answer before the row does — the same precedence the gate uses.
          homeLocationName={
            confirmedLocation?.name ??
            (homeLocationRow !== null
              ? localizedLocationName(homeLocationRow, locale)
              : null)
          }
          onLocationConfirmed={setConfirmedLocation}
        />
      }
      // The panel is where the region block is explained, so the phone-width
      // jump button stays exactly as it was: it scrolls the reader to the
      // answer, which is the same service it does for a gedu who lands here.
      signupActionable={registrationCtaKind(state) === "primary"}
    />
  );
}

/**
 * The eligibility answer, paired with the bound it fell outside of — which is
 * what the picker row's label needs, and what keeps the panel from having to be
 * told the product's age band separately.
 *
 * A block whose own bound is null cannot happen (the helper only returns a side
 * it was given a number for) and resolves to no block rather than to an
 * unlabelable row, so the compiler is satisfied without an assertion.
 */
function describeAgeBlock(
  block: GamerAgeBlock | null,
  product: { min_age: number | null; max_age: number | null },
): SignupAgeBlock | null {
  if (block === "under") {
    return product.min_age === null
      ? null
      : { kind: "under", bound: product.min_age };
  }
  if (block === "over") {
    return product.max_age === null
      ? null
      : { kind: "over", bound: product.max_age };
  }
  return null;
}

/**
 * **The wait, drawn as the page that is coming.**
 *
 * Which affordance this is was decided by the gate above, not discovered at
 * runtime: the page holds until *five* queries have answered — the product, the
 * viewer's auth state, and three customer-scoped reads — before it paints, so
 * this is a perceptibly slow call and gets a structured skeleton immediately,
 * with no delay and no fade. It is not one indexed row, and it is not
 * something React Query can already have. One of the three is deliberately
 * *behind* the others rather than beside them: the children's birth dates are
 * keyed on ids that only the roster read can supply, so the wait covers two
 * hops on a product with a gamer audience and one on any other.
 *
 * **Every one of those waits is a first resolution, and none of them can come
 * back.** This is the whole page, so returning to it is not a loading state but
 * an unmount: the signup panel goes with it, and with the panel go the boxes a
 * parent has ticked and the child they had selected. The birth-date read is the
 * one that could plausibly re-open — its key is the roster's ids, and adding a
 * child changes them — so it is the one that carries the previous answer across
 * a re-key rather than returning to pending. Nothing here waits twice.
 *
 * A sixth read joins them on a narrow slice of visits: the keyed lookup of the
 * family's home location, waited on only where it can change what the signup
 * panel says — a region-locked product, a signed-in parent, a location stored
 * to resolve, and no pick confirmed in the panel's own dialog yet. It drops out
 * again on that read's **first failed attempt**, not on its last retry: the
 * gate fails open rather than holding the page over a retry window, and the
 * page's wait ends where the gate's patience does.
 *
 * **Nothing here is real chrome, and that is a property of this route rather
 * than a shortcut.** The band's three elements — back link, eyebrow, title —
 * all derive from the product row, so none of them is route-static on
 * `/shop/[id]` and none can be rendered before the row lands. The municipality
 * route is no exception: it knows from its URL *where* back goes, but the
 * municipality's name that labels the link comes off the product row like
 * everything else here. So what can be honest is the *shape*: the same
 * container, the same three tracks, the same band, the same 3:2 hero and the
 * same two rails, with ghosts where the content goes.
 *
 * That mirroring replaces an older flat stack under a 5xl cap, which the
 * comment beside it defended on the grounds that a skeleton anchors nothing and
 * so need not match the final grid. True as far as it goes — nothing here
 * survives into the loaded page, so nothing moves — but it was a picture of a
 * single-column page that no longer exists, and "ghosts shaped like the
 * content" is the house rule for a skeleton that is going to be on screen long
 * enough to read.
 */
function DetailLoadingSkeleton() {
  return (
    // The live body's tracks — the same two strings it draws with, so the wait
    // cannot stop being a picture of what follows it.
    <div className={DETAIL_GRID_CLASS}>
      {/* The header band: back link, eyebrow, title, each over its own column,
          mirroring the outer content tracks exactly as the body's band does. */}
      <div className={DETAIL_BAND_CLASS}>
        <div className="h-4 w-32 animate-pulse rounded bg-lifted lg:hidden" />
        <div className="hidden 2xl:col-start-1 2xl:row-start-1 2xl:flex 2xl:h-9 2xl:items-center 2xl:justify-self-end">
          <div className="h-4 w-32 animate-pulse rounded bg-lifted" />
        </div>
        <div className="mt-6 lg:col-start-2 lg:row-start-1 lg:mt-0 lg:flex lg:h-9 lg:items-center 2xl:col-start-3">
          <div className="h-3 w-40 animate-pulse rounded bg-lifted" />
        </div>
        <div className="lg:col-start-1 lg:row-start-1 lg:flex lg:min-w-0 lg:items-start lg:gap-6 2xl:col-start-2">
          <div className="hidden lg:flex lg:h-9 lg:shrink-0 lg:items-center 2xl:hidden">
            <div className="h-4 w-32 animate-pulse rounded bg-lifted" />
          </div>
          <div className="mt-1 h-9 w-3/4 animate-pulse rounded bg-lifted lg:mt-0 lg:min-w-0 lg:flex-1" />
        </div>
      </div>

      {/* Reading block 1: the hero at its real ratio, the blurb, the blurb's
          expanded pitch. The hero's box is the one container whose final size
          is known without the data, which is what keeps the column's height
          roughly right while it waits. */}
      <div className="lg:col-start-2 lg:row-start-2 lg:min-w-0 2xl:col-start-3">
        <div className="aspect-[3/2] w-full animate-pulse rounded-lg bg-lifted" />
        <div className="mt-4 space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-lifted" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-lifted" />
        </div>
        <div className="mt-8 space-y-2">
          <div className="h-5 w-48 animate-pulse rounded bg-lifted" />
          <div className="h-4 w-full animate-pulse rounded bg-lifted" />
          <div className="h-4 w-full animate-pulse rounded bg-lifted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-lifted" />
        </div>
      </div>

      {/* The facts card — reading flow below `2xl`, left rail from it. */}
      <div className="lg:col-start-2 lg:row-start-3 lg:min-w-0 lg:self-start 2xl:col-start-2 2xl:row-start-2 2xl:row-span-2">
        <div className="h-56 animate-pulse rounded-lg bg-lifted" />
      </div>

      {/* Reading block 2: the topic card. */}
      <div className="lg:col-start-2 lg:row-start-4 lg:min-w-0 2xl:col-start-3 2xl:row-start-3">
        <div className="h-32 animate-pulse rounded-lg bg-lifted" />
      </div>

      {/* The signup rail. */}
      <div className="lg:col-start-3 lg:row-start-2 lg:row-span-3 lg:self-start 2xl:col-start-4 2xl:row-span-2">
        <div className="h-96 animate-pulse rounded-lg bg-lifted" />
      </div>
    </div>
  );
}

function DetailNotFound() {
  const t = useTranslations("productDetail");
  // The product failed to load, so we don't know its type/category — send the
  // user back to the shop's default listing rather than a type-specific one.
  return (
    <div className="container mx-auto px-4 py-12">
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <h2 className="text-lg font-semibold">{t("notFound.title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("notFound.description")}
          </p>
          <Link
            href={ROUTES.shop}
            className={buttonVariants({ className: "mt-4" })}
          >
            {t("notFound.cta")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
