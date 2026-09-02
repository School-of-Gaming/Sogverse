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
 *
 * One hue stepped by *construct*, which is the ruled lifecycle shape: outline →
 * solid → muted. Pending is the outline step — a full-value amber edge over a
 * neutral ground under full-value amber ink — running is the act tier's solid
 * fill, and the two finished states drop out of the hue entirely.
 *
 * **The edge is what makes the first step a step.** Pending read as amber ink on
 * muted, which is the *label* tier and identical in construct to `cancelled`; the
 * outline is the part that says "not started yet" rather than "a different kind
 * of thing". Only the tint under it was overruled, never the outline.
 *
 * **Every state carries a `border` class so the geometry cannot move.** The
 * wrapper draws a 1px edge unconditionally and the stateless steps spell it
 * transparent — a chip that grew a border only in one state would resize by 2px
 * the moment a product started, in a row of chips that are all the same height.
 */
const STATUS_STYLE: Record<EffectiveProductStatus, string> = {
  pending: "border-primary bg-muted text-primary",
  running: "border-transparent bg-primary text-primary-foreground",
  completed: "border-transparent bg-muted text-muted-foreground",
  // Same shape as its siblings: destructive is a functional token rather than
  // a brand one, so the tint ban does not reach it — but a lone tinted ground
  // in a map of muted ones was an accident of the sweep, not a decision. No
  // edge: cancelled is an off-ramp from the lifecycle, not a step along it.
  cancelled: "border-transparent bg-muted text-destructive",
  expired: "border-transparent bg-muted text-muted-foreground",
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
        "shrink-0 rounded-full border px-2 py-0.5 text-xs",
        STATUS_STYLE[status],
        className,
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}
