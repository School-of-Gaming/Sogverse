"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { BADGE_FRAME } from "@/components/ui/card-corner-badge";
import { cn } from "@/lib/utils";

/**
 * "3 sessions need attention" — the aggregate of a group's past sessions whose
 * attendance is still unrecorded.
 *
 * Renders nothing at zero. A badge that says "0 sessions need attention" is
 * worse than no badge: it trains the eye to skip the spot where the real
 * warning will appear.
 *
 * **Two shapes, one meaning.** `inline` is the labelled pill that sits in a row
 * of content and says the whole sentence. `corner` is the same fact overlaid on
 * a card's top-right corner as a count, for the dashboard grid — where a gedu
 * is not reading cards but sweeping them for the one that owes something, and a
 * mark on the corner is found in a glance across a whole grid in a way a pill
 * inside the card's body never was.
 */
export function SessionFeedAlertBadge({
  count,
  variant = "inline",
  className,
}: {
  count: number;
  variant?: "inline" | "corner";
  className?: string;
}) {
  const t = useTranslations("gedu.sessionFeed");

  if (count <= 0) return null;

  const label = t("alertBadge", { count });

  if (variant === "corner") {
    return (
      // The shared corner frame every overlaid card badge uses, plus this
      // badge's own severity fill — the same warning amber the feed's
      // per-entry alerts wear, so the dashboard's summary and the entries it
      // summarises read as one signal.
      //
      // **Deliberately the circular form rather than the wider pill.** The
      // frame hangs 8px off the card's edge and is 28px across, so its inner
      // edge lands exactly on the card's own content edge — which is where the
      // chevron-and-Live cluster starts. Circular, the two sit adjacent and
      // neither is touched; the pill form (icon + words) would reach across the
      // chevron and force the cluster to move for a sentence the aria-label
      // already carries in full.
      <div
        role="img"
        aria-label={label}
        title={label}
        className={cn(
          BADGE_FRAME,
          "min-w-7 cursor-default px-1.5 text-xs font-semibold tabular-nums",
          "border border-warning/50 bg-warning/15 text-warning",
          className,
        )}
      >
        {count}
      </div>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border-warning/50 bg-warning/10 text-warning",
        className,
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Badge>
  );
}
