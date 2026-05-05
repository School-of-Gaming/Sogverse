"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";
import { useProductV2Detail, productV2Keys } from "@/services/products-v2";
import { useMyGamers } from "@/services/gamers";
import {
  participationKeys,
  useMyParticipations,
  useParticipationCounts,
  useProductSeatCountsRealtime,
} from "@/services/participations";
import type { ProductTypeV2 } from "@/types";
import { deriveRegistrationState } from "./derive-registration-state";
import { ProductDetailPageBody } from "./product-detail-page-body";
import { ProductPurchasedDetailPlaceholder } from "./product-purchased-detail-placeholder";
import type { AuthState, MyParticipationState } from "./signup-panel-view";

// Route-level adapter: fetches the product, resolves the auth state
// (signed-in customer with gamers / customer with no gamers / non-
// customer / unauthenticated), and forwards everything to the body.
// The body itself is data-only (no fetching) so the mockup preview
// route can render it directly with fixture data.

interface ProductDetailPageProps {
  productId: string;
  productType: ProductTypeV2;
}

export function ProductDetailPage({ productId, productType }: ProductDetailPageProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const redirectParam = `?redirect=${encodeURIComponent(pathname)}`;
  const queryClient = useQueryClient();

  const { user, profile, isLoading: authLoading } = useAuth();
  const isCustomer = profile?.role === "customer";

  const { data: product, isLoading: productLoading, isError } =
    useProductV2Detail(productId);

  const { data: gamers, isLoading: gamersLoading } = useMyGamers({
    enabled: isCustomer,
  });

  const { data: counts, isLoading: countsLoading } = useParticipationCounts(
    product ? [product.id] : [],
  );
  const myCount = counts?.[0];

  // The purchased-detail branch (placeholder for now; real layout TBD) needs
  // the actual participation rows, not just the `mySignupState` flag, so we
  // pull the customer's full list and filter to this product. The browse
  // page already prefetches this query, so on warm-cache navigation it's
  // instant; on cold load we wait below.
  const { data: myParticipations, isLoading: myParticipationsLoading } =
    useMyParticipations();

  // Live seat-count updates for this single product. Browse pages don't
  // subscribe per-card (a 30-card grid is too many channels) — detail page
  // is the only realtime subscriber. Per CLAUDE.md the callback only
  // invalidates queries; never run a Supabase data query inside it.
  useProductSeatCountsRealtime(product?.id);

  // Stripe Checkout bounce-back. Success goes to the browse page (handled
  // upstream), so a `signup=success` here only happens on legacy or copied
  // URLs — invalidate just in case the realtime channel missed the rollup.
  // We deliberately do NOT free the seat on `signup=canceled`: the
  // movie-ticket model holds the seat for the full reservation lifetime, and
  // the parent retries by clicking Sign Up again.
  const signupResult = searchParams.get("signup");
  useEffect(() => {
    if (signupResult === "success") {
      queryClient.invalidateQueries({ queryKey: participationKeys.all });
      queryClient.invalidateQueries({ queryKey: productV2Keys.all });
    }
  }, [signupResult, queryClient]);

  // Wait on every query whose result decides which branch (purchased vs.
  // browse) renders, so we don't paint the signup panel and then snap to
  // the placeholder a tick later. countsLoading carries `mySignupState`
  // (the branch signal); myParticipationsLoading carries the rows the
  // placeholder needs. For non-customers both queries return fast/empty.
  if (
    productLoading ||
    authLoading ||
    (isCustomer && gamersLoading) ||
    (isCustomer && countsLoading) ||
    (isCustomer && myParticipationsLoading)
  ) {
    return <DetailLoadingSkeleton />;
  }

  if (isError || !product) {
    return <DetailNotFound productType={productType} />;
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
      return { kind: "no_gamers", addGamerHref: "/parent/gamers" };
    }
    return {
      kind: "ready",
      gamers: gamers.map((g) => ({
        id: g.id,
        name: g.display_name || g.username,
        age: null,
      })),
    };
  })();

  // Seat math feeds active+reserving for the seat-left pill. Reserving rows
  // count against the seat too — they're held for 30 min while the parent
  // is in Stripe Checkout. The threshold check uses the same number; the
  // small over-count for in-flight reservations is acceptable in v1.
  const participationsCount =
    (myCount?.activeCount ?? 0) + (myCount?.reservingCount ?? 0);

  const state = deriveRegistrationState({
    product,
    now: new Date(),
    participationsCount,
  });

  // Already-signed-up override: if any of the customer's gamers has an
  // active or waitlisted row on this product, swap the entire detail page
  // for the purchased view. Reserving rows are deliberately not surfaced —
  // the movie-ticket model treats the held seat as the parent's to retry
  // against (they just click Sign Up again), not as a "you're already signed
  // up" state. See docs/plans/v2-stripe-participations-plan.md "Movie-ticket
  // reservation model".
  const myParticipationState: MyParticipationState | null =
    myCount?.mySignupState === "active" ||
    myCount?.mySignupState === "waitlisted"
      ? myCount.mySignupState
      : null;

  if (myParticipationState !== null) {
    // Filter the customer's full list down to rows for *this* product.
    // Multi-gamer households get one row per enrolled gamer; the placeholder
    // renders a block per row. The flag is on `participations_v2.product_id`
    // (not the joined product object) which is non-null by schema, so a
    // simple equality is enough.
    const rows = (myParticipations ?? []).filter(
      (p) => p.product_id === product.id,
    );
    return (
      <ProductPurchasedDetailPlaceholder
        product={product}
        productType={productType}
        participations={rows}
      />
    );
  }

  return (
    <ProductDetailPageBody
      product={product}
      state={state}
      authState={authState}
      myParticipationState={null}
    />
  );
}

function DetailLoadingSkeleton() {
  // Match the body's hero + 2-column shape so the layout doesn't shift
  // when data lands.
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
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <div className="h-32 animate-pulse rounded-lg bg-muted" />
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
            <div className="h-64 animate-pulse rounded-lg bg-muted" />
          </div>
          <div className="h-96 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}

function DetailNotFound({ productType }: { productType: ProductTypeV2 }) {
  const t = useTranslations("productDetail");
  return (
    <div className="container mx-auto px-4 py-12">
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <h2 className="text-lg font-semibold">{t("notFound.title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("notFound.description")}
          </p>
          <Link href={browseHref(productType)} className="mt-4">
            <Button>{t("notFound.cta")}</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function browseHref(productType: ProductTypeV2): string {
  switch (productType) {
    case "consumer_club":
    case "municipality_club":
      return "/clubs";
    case "camp":
      return "/camps";
    case "event":
      return "/events";
  }
}
