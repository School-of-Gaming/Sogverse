"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { useNow } from "@/providers";
import { useAuth } from "@/providers/auth-provider";
import { useProductDetail } from "@/services/products";
import { useMyGamers } from "@/services/gamers";
import {
  useParticipationCounts,
  useProductSeatCountsRealtime,
} from "@/services/participations";
import { deriveRegistrationState } from "./derive-registration-state";
import {
  ProductDetailPageBody,
  type MunicipalityBackLink,
} from "./product-detail-page-body";
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
   * Present when this detail page was opened from a `/schools/<slug>` listing
   * (the `/schools/<slug>/[id]` route). Redirects the back link to that
   * municipality instead of the storefront. Omitted on `/shop/[id]`.
   */
  municipality?: MunicipalityBackLink;
}

export function ProductDetailPage({
  productId,
  municipality,
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
  if (
    productLoading ||
    authLoading ||
    (isCustomer && gamersLoading) ||
    (isCustomer && countsLoading)
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
    // **This is the one place the three audience cases are told apart**, and
    // the whole of the difference is which rows go into the array:
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
    const participantStates = myCount?.myGamerStates ?? {};
    const gamerRows = product.for_gamers
      ? (gamers ?? []).map((g) => ({
          id: g.id,
          name: g.first_name,
          age: null,
          signupState: participantStates[g.id] ?? null,
        }))
      : [];
    const selfRow = product.for_parents
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

  return (
    <ProductDetailPageBody
      product={product}
      municipality={municipality}
      signupPanel={
        <SignupPanel product={product} state={state} authState={authState} />
      }
    />
  );
}

function DetailLoadingSkeleton() {
  // Generic placeholder shared by all three branches (public signup, gedu
  // detail, purchased view). The hero is identical across them, but the
  // body grids diverge — public is 1fr/380px, gedu is 1/3 + 2/3, purchased
  // is a stack — so the skeleton below the hero is intentionally a flat
  // stack of rectangles. Per CLAUDE.md "Layout & Scrolling", a skeleton
  // with no rendered text or interactions doesn't anchor anything, so it
  // doesn't need to mirror the final grid; the body simply appears in
  // place when data lands.
  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-6 grid gap-6 sm:grid-cols-[140px_1fr]">
          <div className="aspect-square w-full animate-pulse rounded-lg bg-muted sm:w-[140px]" />
          <div className="space-y-3">
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            <div className="h-7 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="mt-8 space-y-6">
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        </div>
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
