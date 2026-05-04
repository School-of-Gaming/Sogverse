"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { Identicon } from "@/components/ui/identicon";
import { cn } from "@/lib/utils";
import type { ParticipationState } from "@/types";

// Pure presentational purchased ("your enrolled / signed up") card.
// Mirrors `ProductBrowseCardView` — adapter feeds it already-resolved
// display props.

export interface PurchasedGamerDisplay {
  displayName: string;
  /** Optional stable seed for the identicon (UUID is ideal). */
  seed?: string;
}

export interface ProductPurchasedCardViewProps {
  name: string;
  imagePath: string | null;
  topicLabel: string;
  /**
   * Placement state driving the status badge color + copy.
   *  - `waitlisted`  → amber "Waitlist"
   *  - `unassigned`  → green "Confirmed" (no group yet)
   *  - `assigned`    → green "Confirmed" (group set)
   */
  state: ParticipationState;
  /**
   * One gamer per participation row. Multi-gamer households have multiple
   * participations on the same product — they each get their own card.
   */
  gamer: PurchasedGamerDisplay;
  scheduleSummary: string;
  /**
   * Pre-resolved detail line. Adapter chooses copy per state:
   *   waitlisted → "We'll email when a seat opens"
   *   unassigned → "We'll set up your group"
   *   assigned   → "Next session: …"
   */
  detailLine: string;
  /**
   * Optional credit-balance line for bundle-covered consumer-club rows.
   *   bundle, N>0   → "{N} sessions left"
   *   bundle, 0     → "No sessions left — buy more"
   *   sub-covered   → "Subscription"
   *   anything else → null (camp / event / free → no balance line)
   */
  balanceLine: string | null;
  /**
   * Hide the manage-payment surface for muni clubs (registration goes
   * through the municipality's own flow).
   */
  showManagePayment: boolean;
}

export function ProductPurchasedCardView({
  name,
  imagePath,
  topicLabel,
  state,
  gamer,
  scheduleSummary,
  detailLine,
  balanceLine,
  showManagePayment,
}: ProductPurchasedCardViewProps) {
  const t = useTranslations("productBrowse.card");
  const isWaitlist = state === "waitlisted";
  const accent = isWaitlist ? "border-warning/50 bg-warning/5" : "border-primary/50 bg-primary/5";
  const topicColor = isWaitlist ? "text-warning" : "text-primary";
  const sparkleColor = isWaitlist ? "text-warning" : "text-primary";
  const borderTop = isWaitlist ? "border-warning/20" : "border-primary/20";

  return (
    <Card className={cn("relative h-full overflow-visible shadow-sm", accent)}>
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex gap-3">
          <div className="relative">
            {imagePath ? (
              <ProductThumbnail
                imagePath={imagePath}
                alt={name}
                size="h-20 w-20 sm:h-24 sm:w-24"
                className="rounded-md bg-muted [&>img]:aspect-square [&>img]:h-full [&>img]:w-full [&>img]:object-cover"
              />
            ) : (
              <div className={cn("flex h-20 w-20 items-center justify-center rounded-md font-display text-2xl font-bold sm:h-24 sm:w-24",
                isWaitlist ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary",
              )}>
                {name.charAt(0)}
              </div>
            )}

            <GamerClip gamer={gamer} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-start gap-2">
              <h3 className="line-clamp-2 flex-1 text-sm font-semibold sm:text-base">
                {name}
              </h3>
              <StatusBadge state={state} />
            </div>

            <p className={cn("text-xs font-medium uppercase tracking-wide", topicColor)}>
              {topicLabel}
            </p>

            <ul className="space-y-0.5 text-xs text-muted-foreground">
              <li className="line-clamp-1">{scheduleSummary}</li>
              <li className="line-clamp-1">
                {t("gamersLabel", { names: gamer.displayName })}
              </li>
            </ul>
          </div>
        </div>

        <div className={cn("mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3", borderTop)}>
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <Sparkles className={cn("h-3 w-3", sparkleColor)} aria-hidden />
              {detailLine}
            </span>
            {balanceLine && (
              <span className="text-muted-foreground tabular-nums">
                {balanceLine}
              </span>
            )}
          </div>
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

function StatusBadge({ state }: { state: ParticipationState }) {
  const t = useTranslations("productBrowse.card");
  if (state === "waitlisted") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 border-warning/60 bg-warning/10 text-[10px] text-warning"
      >
        {t("statusWaitlist")}
      </Badge>
    );
  }
  return (
    <Badge variant="default" className="shrink-0 text-[10px]">
      {t("statusConfirmed")}
    </Badge>
  );
}

// Single-gamer card — one identicon clipped to the thumbnail's top-right.
function GamerClip({ gamer }: { gamer: PurchasedGamerDisplay }) {
  return (
    <div className="absolute -right-2 -top-2 flex">
      <div
        className="relative h-8 w-8 rotate-6 overflow-hidden rounded-full border-2 border-background bg-background shadow-md"
        title={gamer.displayName}
      >
        <Identicon id={gamer.seed ?? gamer.displayName} size={32} />
      </div>
    </div>
  );
}
