"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { Identicon } from "@/components/ui/identicon";
import { cn } from "@/lib/utils";
import type { ProductTypeV2 } from "@/types";
import type { MockPurchasedRow } from "./mock-purchased";

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

// "Your enrolled / registered / signed-up / joined" card.
//
// Mirrors the browse-card layout (square thumbnail + dense info column)
// so a parent's eye doesn't have to relearn the row when scanning the
// page. Distinguishing cues:
//   • primary-color accent border + faint primary fill
//   • verb badge ("Enrolled" / "Registered" / "Signed up" / "Joined")
//   • each linked gamer's avatar pinned to the thumbnail like a
//     polaroid clip, signalling "this gamer is attached to this product"
//   • "Next session" line replaces the price block at the bottom — the
//     parent already paid, the question is "when's the next one"
export function ProductPurchasedCard({ row }: ProductPurchasedCardProps) {
  const t = useTranslations("productBrowse.card");
  const verbLabel = t(VERB_KEYS[row.productType]);
  const gamerNames = row.gamers.map((g) => g.displayName).join(", ");
  const showManagePayment = row.billingMode !== "external_contract";

  return (
    <Card className="relative h-full overflow-visible border-primary/50 bg-primary/5 shadow-sm">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex gap-3">
          <div className="relative">
            {row.imagePath ? (
              <ProductThumbnail
                imagePath={row.imagePath}
                alt={row.name}
                size="h-20 w-20 sm:h-24 sm:w-24"
                className="rounded-md bg-muted [&>img]:aspect-square [&>img]:h-full [&>img]:w-full [&>img]:object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-md bg-primary/10 font-display text-2xl font-bold text-primary sm:h-24 sm:w-24">
                {row.name.charAt(0)}
              </div>
            )}

            <GamerClips gamers={row.gamers} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-start gap-2">
              <h3 className="line-clamp-2 flex-1 text-sm font-semibold sm:text-base">
                {row.name}
              </h3>
              <Badge variant="default" className="shrink-0 text-[10px]">
                {verbLabel}
              </Badge>
            </div>

            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              {row.topicLabel}
            </p>

            <ul className="space-y-0.5 text-xs text-muted-foreground">
              <li className="line-clamp-1">{row.scheduleSummary}</li>
              <li className="line-clamp-1">
                {t("gamersLabel", { names: gamerNames })}
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-primary/20 pt-3">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
            <Sparkles className="h-3 w-3 text-primary" aria-hidden />
            {t("nextSession", { when: row.nextSession })}
          </span>
          {showManagePayment && (
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={() => {
                /* noop: management page lands in a follow-up */
              }}
            >
              {t("manage")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Stack of small avatars pinned to the top-right corner of the thumbnail.
// First avatar is rotated slightly to look "clipped on"; additional
// gamers fan out in the opposite direction.
//
// Capped at 3 by design — three 32px avatars with 8px overlap already
// span ~72px, which covers most of the 80–96px thumbnail. A 4th would
// start eating the product image. The "For X, Y, Z" line below the
// title is the source of truth for the full gamer list, so the clip
// stack staying short while the text line shows everyone is an
// intentional asymmetry. Swap to "2 avatars + a +N chip" if real data
// turns out to have lots of 4+ gamer households.
function GamerClips({
  gamers,
}: {
  gamers: { displayName: string; seed?: string }[];
}) {
  if (gamers.length === 0) return null;

  return (
    <div className="absolute -right-2 -top-2 flex">
      {gamers.slice(0, 3).map((g, i) => (
        <div
          key={g.displayName + i}
          className={cn(
            "relative h-8 w-8 overflow-hidden rounded-full border-2 border-background bg-background shadow-md",
            i === 0 ? "rotate-6" : "-rotate-3",
            i > 0 && "-ml-2",
          )}
          title={g.displayName}
        >
          <Identicon id={g.seed ?? g.displayName} size={32} />
        </div>
      ))}
    </div>
  );
}
