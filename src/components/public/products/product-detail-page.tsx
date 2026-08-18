"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { useNow } from "@/providers";
import { useAuth } from "@/providers/auth-provider";
import { useLocationsByIds } from "@/services/locations";
import { useProductDetail } from "@/services/products";
import { useMyGamers } from "@/services/gamers";
import {
  useParticipationCounts,
  useProductSeatCountsRealtime,
} from "@/services/participations";
import {
  deriveRegistrationState,
  registrationCtaKind,
} from "./derive-registration-state";
import { ProductDetailPageBody } from "./product-detail-page-body";
import { audienceAdmitsRole, productAudience } from "./product-audience";
import { deriveRegionGate, type RegionGate } from "./region-lock/region-gate";
import { SignupPanel } from "./signup-panel";
import type { AuthState } from "./signup-panel-view";

// Route-level adapter: fetches the product, resolves the auth state
// (signed-in customer with gamers / customer with no gamers / non-
// customer / unauthenticated), and forwards everything to the body.
// The body itself is data-only (no fetching) so the mockup preview
// route can render it directly with fixture data.

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
  const redirectParam = `?redirect=${encodeURIComponent(pathname)}`;

  const { user, profile, isLoading: authLoading } = useAuth();
  const isCustomer = profile?.role === "customer";

  // Ticking clock (30s), server-seeded so SSR and the first client render
  // agree — same source the browse card derives its state from. An event's
  // registration closes at the instant its session ends, which can land while
  // this page is open; a one-shot `new Date()` would leave a stale signup
  // panel up until the visitor reloaded.
  const now = useNow();

  const { data: product, isLoading: productLoading, isError } =
    useProductDetail(productId);

  const { data: gamers, isLoading: gamersLoading } = useMyGamers({
    enabled: isCustomer,
  });

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
  // The country a parent confirms in the panel's dialog is held here for the
  // gap between the write and the read of the row it points at — see the gate
  // below.
  // ---------------------------------------------------------------------
  const homeLocationId = isCustomer ? profile.home_location_id : null;
  const { data: homeLocationRows, isLoading: homeLocationLoading } =
    useLocationsByIds(homeLocationId ? [homeLocationId] : []);
  const [confirmedCountry, setConfirmedCountry] = useState<
    string | null | undefined
  >(undefined);

  // Live seat-count updates for this single product. Browse pages don't
  // subscribe per-card (a 30-card grid is too many channels) — detail page
  // is the only realtime subscriber. Per CLAUDE.md the callback only
  // invalidates queries; never run a Supabase data query inside it.
  useProductSeatCountsRealtime(product?.id);

  // Wait on every query the signup panel depends on before painting, so we
  // don't show a child as selectable and then snap them to a disabled
  // "Signed up" row a tick later. countsLoading carries `myGamerStates`
  // (the per-child already-enrolled signal). For non-customers the
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
  // straight to `confirmedCountry`, so the read that follows has nothing left
  // to tell us.
  if (
    productLoading ||
    authLoading ||
    (isCustomer && gamersLoading) ||
    (isCustomer && countsLoading) ||
    (isCustomer &&
      product?.region_lock_country != null &&
      homeLocationId !== null &&
      confirmedCountry === undefined &&
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
        signInHref: `/login${redirectParam}`,
        createAccountHref: `/register${redirectParam}`,
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
    const gamerRows = audienceAdmitsRole(audience, "gamer")
      ? (gamers ?? []).map((g) => ({
          id: g.id,
          name: g.first_name,
          age: null,
          signupState: participantStates[g.id] ?? null,
        }))
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

  // The lock, against where this family says it lives. A visitor and a
  // wrong-role viewer are handed `unlocked` rather than checked: they meet an
  // overlay of their own first, and telling them where the product is sold
  // answers a question they have not reached. The confirmed country outranks
  // the read for as long as both are in play; they agree the moment the read
  // lands.
  const regionGate: RegionGate =
    authState.kind === "ready"
      ? deriveRegionGate(
          product.region_lock_country,
          confirmedCountry !== undefined
            ? confirmedCountry
            : (homeLocationRows?.[0]?.country_code ?? null),
        )
      : { kind: "unlocked" };

  return (
    <ProductDetailPageBody
      product={product}
      municipalitySlug={municipalitySlug}
      signupPanel={
        <SignupPanel
          product={product}
          state={state}
          authState={authState}
          regionGate={regionGate}
          onLocationConfirmed={setConfirmedCountry}
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
 * **The wait, drawn as the page that is coming.**
 *
 * Which affordance this is was decided by the gate above, not discovered at
 * runtime: the page holds until *four* queries have answered — the product, the
 * viewer's auth state, and two customer-scoped reads — before it paints, so
 * this is a perceptibly slow call and gets a structured skeleton immediately,
 * with no delay and no fade. It is not one indexed row, and it is not
 * something React Query can already have.
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
    // The live body's tracks, verbatim — change them there and change them
    // here, or the wait stops being a picture of what follows it.
    <div className="container mx-auto space-y-6 px-4 py-8 sm:py-12 lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1fr)_minmax(0,44rem)_20rem] lg:gap-6 lg:space-y-0 2xl:grid-cols-[minmax(0,1fr)_16rem_minmax(0,44rem)_20rem_minmax(0,1fr)]">
      {/* The header band: back link, eyebrow, title, each over its own column,
          mirroring the outer content tracks exactly as the body's band does. */}
      <div className="lg:col-start-2 lg:col-span-2 lg:row-start-1 lg:grid lg:grid-cols-[minmax(0,44rem)_20rem] lg:gap-6 2xl:col-start-2 2xl:col-span-3 2xl:grid-cols-[16rem_minmax(0,44rem)_20rem]">
        <div className="h-4 w-32 animate-pulse rounded bg-muted lg:hidden" />
        <div className="hidden 2xl:col-start-1 2xl:row-start-1 2xl:flex 2xl:h-9 2xl:items-center 2xl:justify-self-end">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="mt-6 lg:col-start-2 lg:row-start-1 lg:mt-0 lg:flex lg:h-9 lg:items-center 2xl:col-start-3">
          <div className="h-3 w-40 animate-pulse rounded bg-muted" />
        </div>
        <div className="lg:col-start-1 lg:row-start-1 lg:flex lg:min-w-0 lg:items-start lg:gap-6 2xl:col-start-2">
          <div className="hidden lg:flex lg:h-9 lg:shrink-0 lg:items-center 2xl:hidden">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          </div>
          <div className="mt-1 h-9 w-3/4 animate-pulse rounded bg-muted lg:mt-0 lg:min-w-0 lg:flex-1" />
        </div>
      </div>

      {/* Reading block 1: the hero at its real ratio, the blurb, the blurb's
          expanded pitch. The hero's box is the one container whose final size
          is known without the data, which is what keeps the column's height
          roughly right while it waits. */}
      <div className="lg:col-start-2 lg:row-start-2 lg:min-w-0 2xl:col-start-3">
        <div className="aspect-[3/2] w-full animate-pulse rounded-lg bg-muted" />
        <div className="mt-4 space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
        </div>
        <div className="mt-8 space-y-2">
          <div className="h-5 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      </div>

      {/* The facts card — reading flow below `2xl`, left rail from it. */}
      <div className="lg:col-start-2 lg:row-start-3 lg:min-w-0 lg:self-start 2xl:col-start-2 2xl:row-start-2 2xl:row-span-2">
        <div className="h-56 animate-pulse rounded-lg bg-muted" />
      </div>

      {/* Reading block 2: the topic card. */}
      <div className="lg:col-start-2 lg:row-start-4 lg:min-w-0 2xl:col-start-3 2xl:row-start-3">
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
      </div>

      {/* The signup rail. */}
      <div className="lg:col-start-3 lg:row-start-2 lg:row-span-3 lg:self-start 2xl:col-start-4 2xl:row-span-2">
        <div className="h-96 animate-pulse rounded-lg bg-muted" />
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
