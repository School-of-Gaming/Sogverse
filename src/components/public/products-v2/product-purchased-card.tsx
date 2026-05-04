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
    ? (resolveTranslation(product.product_translations_v2, uiLocale)?.name ?? "")
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
    // once the calendar widget is plumbed in here. For v2 launch, the
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

  // The participations service joins one gamer per row. Pull a display
  // name from the gamer_id; for v2 launch we use the gamer_id as the
  // identicon seed which keeps the avatar stable. A future improvement
  // adds the gamer's display_name to the join (RLS-permitting).
  const gamer = {
    displayName: participation.gamer_id.slice(0, 8),
    seed: participation.gamer_id,
  };

  const showManagePayment = product?.billing_mode !== "external_contract";

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
    />
  );
}
