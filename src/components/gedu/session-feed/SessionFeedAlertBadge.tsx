"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * "3 sessions need attention" — the aggregate of a group's past sessions whose
 * attendance is still unrecorded, small enough to sit on a product card on the
 * gedu dashboard and point at the feed.
 *
 * Renders nothing at zero. A badge that says "0 sessions need attention" is
 * worse than no badge: it trains the eye to skip the spot where the real
 * warning will appear.
 */
export function SessionFeedAlertBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  const t = useTranslations("gedu.sessionFeed");

  if (count <= 0) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border-warning/50 bg-warning/10 text-warning",
        className,
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      {t("alertBadge", { count })}
    </Badge>
  );
}
