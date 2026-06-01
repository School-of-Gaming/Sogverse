"use client";

import { useLocale, useTranslations } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { participationStateOf } from "@/lib/participation-state";
import type { MyParticipationRow } from "@/services/participations";
import { ProductPurchasedCardView } from "./product-purchased-card-view";

interface ProductPurchasedCardProps {
  participation: MyParticipationRow;
}

// Adapter: maps a real `MyParticipationRow` (joined with the product +
// translations + the live family-sub-item flag) into the View's display
// props. One card per (gamer, product) participation row — multi-gamer
// households see multiple cards on the same product.
export function ProductPurchasedCard({ participation }: ProductPurchasedCardProps) {
  const t = useTranslations("productBrowse.card");
  const uiLocale = resolveLocale(useLocale());

  const product = participation.product;
  const productName = product
    ? (resolveTranslation(product.product_translations, uiLocale)?.name ?? "")
    : "";

  const placement = participationStateOf({
    status: participation.status,
    group_id: participation.group_id,
  });

  // Detail line — first-class info for the parent. Varies by placement.
  const detailLine = (() => {
    if (placement === "waitlisted") {
      const pos = participation.waitlist_position;
      return pos !== null && pos > 0
        ? t("purchasedDetailWaitlistWithPosition", { position: pos })
        : t("purchasedDetailWaitlist");
    }
    if (placement === "unassigned") {
      return t("purchasedDetailUnassigned");
    }
    // assigned — schedule formatter would produce a real "next session" line
    // once the calendar widget is plumbed in here. For now, the
    // placeholder reads cleanly and the future detail page will carry the
    // calendar.
    return t("purchasedDetailNoSchedule");
  })();

  // Balance line — bundle-covered consumer clubs only.
  const balanceLine = (() => {
    if (!product) return null;
    if (product.product_type !== "consumer_club") return null;
    if (product.billing_mode !== "paid") return null;
    if (placement === "waitlisted") return null;
    if (participation.is_sub_covered) {
      return t("balanceSubscription");
    }
    if (participation.credits_remaining > 0) {
      return t("balanceSessionsLeft", { count: participation.credits_remaining });
    }
    return t("balanceNoSessionsLeft");
  })();

  // The participations service joins the gamer's profile (first_name +
  // username). Prefer first_name; fall back to username; final fallback
  // is a slice of the id so we still render *something* if both are null
  // (shouldn't happen — a gamer profile is created with at least a
  // username — but the types allow it). The gamer_id is the identicon
  // seed regardless, which keeps the avatar stable across name changes.
  const firstName =
    participation.gamer?.first_name ||
    participation.gamer?.username ||
    participation.gamer_id.slice(0, 8);
  const gamer = {
    firstName,
    seed: participation.gamer_id,
  };

  const showManagePayment = product?.billing_mode !== "external_contract";

  // The Manage button navigates to the product's detail route — same URL the
  // browse grid uses; the page branches on whether the parent owns it. While
  // the placeholder is in place the detail view dumps raw participation rows
  // for verification; when the real layout lands here the link target stays
  // the same.
  const manageHref =
    product !== null ? detailHrefFor(product.product_type, product.id) : "/";

  return (
    <ProductPurchasedCardView
      name={productName}
      imagePath={product?.image_path ?? null}
      topicLabel=""
      state={placement}
      gamer={gamer}
      scheduleSummary=""
      detailLine={detailLine}
      balanceLine={balanceLine}
      showManagePayment={Boolean(showManagePayment)}
      manageHref={manageHref}
    />
  );
}

function detailHrefFor(
  productType: NonNullable<MyParticipationRow["product"]>["product_type"],
  productId: string,
): string {
  switch (productType) {
    case "consumer_club":
    case "municipality_club":
      return `/clubs/${productId}`;
    case "camp":
      return `/camps/${productId}`;
    case "event":
      return `/events/${productId}`;
  }
}
