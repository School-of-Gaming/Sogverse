"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { EffectiveProductStatus } from "@/lib/products/effective-status";

/**
 * The one chip that says what state a product is in.
 *
 * Keyed by the effective status, exhaustively: the compiler is what guarantees
 * every member has a colour, so there is no fallback to reach for and no way to
 * add a status without being asked what it wears.
 *
 * This map existed twice — byte-identical, in the list row and on the details
 * page — which is the shape of duplication that gets fixed in one copy and not
 * the other. A product's state is one fact and it has one colour, so both
 * surfaces render this component now and a fifth status cannot arrive in one
 * place looking different from the other.
 */
const STATUS_STYLE: Record<EffectiveProductStatus, string> = {
  // Neutral ground, full-value ink: a tinted brand ground is a darkened brand
  // colour, so the amber lives in the label and the lift comes from a neutral.
  pending: "bg-muted text-primary",
  running: "bg-primary text-primary-foreground",
  completed: "bg-muted text-muted-foreground",
  // Same shape as its siblings: destructive is a functional token rather than
  // a brand one, so the tint ban does not reach it — but a lone tinted ground
  // in a map of muted ones was an accident of the sweep, not a decision.
  cancelled: "bg-muted text-destructive",
  expired: "bg-muted text-muted-foreground",
};

export function ProductStatusChip({
  status,
  className,
}: {
  status: EffectiveProductStatus;
  className?: string;
}) {
  const t = useTranslations("admin.products");

  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs",
        STATUS_STYLE[status],
        className,
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}
