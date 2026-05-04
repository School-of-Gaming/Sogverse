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
  useParticipationCounts,
  useProductSeatCountsRealtime,
} from "@/services/participations";
import type { ProductTypeV2 } from "@/types";
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

  const { data: counts } = useParticipationCounts(
    product ? [product.id] : [],
  );
  const myCount = counts?.[0];

  // Live seat-count updates for this single product. Browse pages don't
  // subscribe per-card (a 30-card grid is too many channels) — detail page
  // is the only realtime subscriber. Per CLAUDE.md the callback only
  // invalidates queries; never run a Supabase data query inside it.
  useProductSeatCountsRealtime(product?.id);

  // Stripe Checkout success bounce-back: invalidate to close the gap between
  // the webhook flipping the reservation to active and the browser learning
  // about it. Realtime usually catches it first, but cellular networks can
  // drop the channel — explicit invalidation here is the belt-and-suspenders.
  const signupResult = searchParams.get("signup");
  useEffect(() => {
    if (signupResult === "success") {
      queryClient.invalidateQueries({ queryKey: participationKeys.all });
      queryClient.invalidateQueries({ queryKey: productV2Keys.all });
    }
  }, [signupResult, queryClient]);

  if (productLoading || authLoading || (isCustomer && gamersLoading)) {
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
        name: g.username,
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

  // Already-signed-up override: if any of the customer's gamers has a row
  // on this product, replace the signup form with the status panel.
  const myParticipationState: MyParticipationState | null =
    myCount?.mySignupState && myCount.mySignupState !== "none"
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
