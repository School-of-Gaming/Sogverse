"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";
import { useProductV2Detail } from "@/services/products-v2";
import { useMyGamers } from "@/services/gamers";
import type { ProductTypeV2 } from "@/types";
import { deriveRegistrationState } from "./derive-registration-state";
import { ProductDetailPageBody } from "./product-detail-page-body";
import type { AuthState } from "./signup-panel-view";

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
  const redirectParam = `?redirect=${encodeURIComponent(pathname)}`;

  const { user, profile, isLoading: authLoading } = useAuth();
  const isCustomer = profile?.role === "customer";

  const { data: product, isLoading: productLoading, isError } =
    useProductV2Detail(productId);

  const { data: gamers, isLoading: gamersLoading } = useMyGamers();

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
      selectedGamerId: gamers[0]?.id ?? null,
    };
  })();

  const state = deriveRegistrationState({
    product,
    now: new Date(),
    participationsCount: 0,
  });

  return (
    <ProductDetailPageBody
      product={product}
      state={state}
      authState={authState}
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
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
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
