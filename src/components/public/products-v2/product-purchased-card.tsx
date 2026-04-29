"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import type { ProductTypeV2 } from "@/types";
import type { MockPurchasedRow } from "./mock-purchased";

interface ProductPurchasedCardProps {
  row: MockPurchasedRow;
}

const VERB_KEYS: Record<ProductTypeV2, "verbConsumerClub" | "verbMunicipalityClub" | "verbCamp" | "verbEvent"> = {
  consumer_club: "verbConsumerClub",
  municipality_club: "verbMunicipalityClub",
  camp: "verbCamp",
  event: "verbEvent",
};

// "Your enrolled / registered / signed-up / joined" card.
//
// Visually distinct from the browse card: primary-color accent border
// and a verb badge that matches the product type's parent-facing copy
// (per redesign §3). Hides the "Manage" payment cue when the product
// is funded externally (muni clubs) — there's no payment surface to
// manage on those.
export function ProductPurchasedCard({ row }: ProductPurchasedCardProps) {
  const t = useTranslations("productBrowse.card");
  const verbLabel = t(VERB_KEYS[row.productType]);
  const gamerNames = row.gamers.map((g) => g.displayName).join(", ");

  return (
    <Card className="relative h-full overflow-hidden border-primary/40 bg-primary/5">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
        <div className="flex shrink-0 items-start justify-center sm:w-24">
          {row.imagePath ? (
            <ProductThumbnail
              imagePath={row.imagePath}
              alt={row.name}
              size="h-20 w-20"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-md bg-primary/10 text-2xl font-display font-bold text-primary">
              {row.name.charAt(0)}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-start gap-2">
            <h3 className="text-sm font-semibold sm:text-base">{row.name}</h3>
            <Badge variant="default" className="text-[10px]">
              {verbLabel}
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground">{row.topicLabel}</p>

          <ul className="space-y-0.5 text-xs">
            <li>
              <span className="font-medium">
                {t("nextSession", { when: row.nextSession })}
              </span>
            </li>
            <li className="text-muted-foreground">{row.scheduleSummary}</li>
            <li className="text-muted-foreground">
              {t("gamersLabel", { names: gamerNames })}
            </li>
          </ul>

          <div className="mt-auto flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              variant={row.billingMode === "external_contract" ? "outline" : "default"}
              onClick={() => {
                /* noop: management page lands in a follow-up */
              }}
            >
              {t("manage")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
