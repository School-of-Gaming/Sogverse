"use client";

import { useTranslations } from "next-intl";
import {
  useMyAssignedProducts,
  type MyAssignedProductSessionRow,
} from "@/services/assignments";
import { GroupCard } from "./GroupCard";

/**
 * Data-bound section on the gedu dashboard. Calls `useMyAssignedProducts`
 * (which owns the expansion + `useNow()` tick) and renders one
 * `GroupCard` per assigned product, ordered by soonest upcoming
 * session. Products with no future occurrence are dropped at the adapter
 * step — see `expandAssignedProductsToCards`.
 *
 * `initialRows` is the server-prefetched payload from `gedu/page.tsx` so
 * the section paints with real data on first frame, no skeleton flash.
 */
export function GroupsSection({
  initialRows,
}: {
  initialRows: MyAssignedProductSessionRow[];
}) {
  const t = useTranslations("gedu.myGroups");
  const cards = useMyAssignedProducts({ initialData: initialRows });

  if (cards.length === 0) {
    return <p className="text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-3">
      {cards.map((card) => (
        <GroupCard key={card.productId} {...card} />
      ))}
    </div>
  );
}
