"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { useAuth } from "@/providers/auth-provider";
import {
  useProductDetail,
  productKeys,
} from "@/services/products";
import { useMyGamers } from "@/services/gamers";
import {
  participationKeys,
  useParticipationCounts,
  useProductSeatCountsRealtime,
} from "@/services/participations";
import { deriveRegistrationState } from "./derive-registration-state";
import { ProductDetailPageBody } from "./product-detail-page-body";
import type { AuthState, MyParticipationState } from "./signup-panel-view";

// Route-level adapter: fetches the product, resolves the auth state
// (signed-in customer with gamers / customer with no gamers / non-
// customer / unauthenticated), and forwards everything to the body.
// The body itself is data-only (no fetching) so the mockup preview
// route can render it directly with fixture data.

interface ProductDetailPageProps {
  productId: string;
}

export function ProductDetailPage({ productId }: ProductDetailPageProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const redirectParam = `?redirect=${encodeURIComponent(pathname)}`;
  const queryClient = useQueryClient();

  const { user, profile, isLoading: authLoading } = useAuth();
  const isCustomer = profile?.role === "customer";

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

  // Stripe Checkout success bounces back here — the checkout route sets
  // success_url to /shop/[id]?signup=success. The flag triggers a query
  // invalidation so the freshly-confirmed participation surfaces (the signup
  // panel flips to its already-signed-up state) even if the realtime
  // seat-count channel missed the rollup. We deliberately do NOT free the seat
  // on `signup=canceled`: the movie-ticket model holds the seat for the full
  // reservation lifetime, and the parent retries by clicking Sign Up again.
  const signupResult = searchParams.get("signup");
  useEffect(() => {
    if (signupResult === "success") {
      queryClient.invalidateQueries({ queryKey: participationKeys.all });
      queryClient.invalidateQueries({ queryKey: productKeys.all });
    }
  }, [signupResult, queryClient]);

  // Wait on every query the signup panel depends on before painting, so we
  // don't show the default registration CTA and then snap to the
  // already-signed-up state a tick later. countsLoading carries
  // `mySignupState` (the already-enrolled signal). For non-customers the
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
    if (!isCustomer) {
      return { kind: "non_customer" };
    }
    if (!gamers || gamers.length === 0) {
      return { kind: "no_gamers", addGamerHref: "/parent" };
    }
    return {
      kind: "ready",
      gamers: gamers.map((g) => ({
        id: g.id,
        name: g.first_name || g.username,
        age: null,
      })),
    };
  })();

  // Seat math feeds active+reserving for the seat-left pill. Reserving rows
  // count against the seat too — they're held for 30 min while the parent
  // is in Stripe Checkout. The threshold check uses the same number; the
  // small over-count for in-flight reservations is acceptable.
  const participationsCount =
    (myCount?.activeCount ?? 0) + (myCount?.reservingCount ?? 0);

  const state = deriveRegistrationState({
    product,
    now: new Date(),
    participationsCount,
  });

  // Already-signed-up signal: if any of the customer's gamers holds an active
  // or waitlisted row on this product, the signup panel renders its
  // already-signed-up state instead of the default registration CTA. The page
  // is the same ProductDetailPageBody every product uses. Reserving rows are
  // deliberately not surfaced — the movie-ticket model treats the held seat as
  // the parent's to retry against (they just click Sign Up again). See
  // docs/products-architecture.md "Movie-ticket reservation model".
  const myParticipationState: MyParticipationState | null =
    myCount?.mySignupState === "active" ||
    myCount?.mySignupState === "waitlisted"
      ? myCount.mySignupState
      : null;

  return (
    <ProductDetailPageBody
      product={product}
      state={state}
      authState={authState}
      myParticipationState={myParticipationState}
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
