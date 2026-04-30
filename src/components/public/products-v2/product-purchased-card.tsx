"use client";

import { useTranslations } from "next-intl";
import type { ProductTypeV2 } from "@/types";
import type { MockPurchasedRow } from "./mock-purchased";
import { ProductPurchasedCardView } from "./product-purchased-card-view";

interface ProductPurchasedCardProps {
  row: MockPurchasedRow;
}

const VERB_KEYS: Record<
  ProductTypeV2,
  "verbConsumerClub" | "verbMunicipalityClub" | "verbCamp" | "verbEvent"
> = {
  consumer_club: "verbConsumerClub",
  municipality_club: "verbMunicipalityClub",
  camp: "verbCamp",
  event: "verbEvent",
};

// Adapter: resolves a `MockPurchasedRow` (later: a real participation
// row) into the display props the View consumes. Mirrors the
// browse-card adapter pattern.
//
// The purchased card doesn't surface a registration pill — the verb
// badge ("Enrolled" / "Registered" / "Signed up" / "Joined") already
// answers "are you in?". Muni-club rows simply hide the manage-payment
// button because sign-up went through the city's own flow.
export function ProductPurchasedCard({ row }: ProductPurchasedCardProps) {
  const t = useTranslations("productBrowse.card");
  const verbLabel = t(VERB_KEYS[row.productType]);

  return (
    <ProductPurchasedCardView
      name={row.name}
      imagePath={row.imagePath}
      topicLabel={row.topicLabel}
      verbLabel={verbLabel}
      gamers={row.gamers}
      scheduleSummary={row.scheduleSummary}
      nextSession={row.nextSession}
      showManagePayment={row.billingMode !== "external_contract"}
    />
  );
}
