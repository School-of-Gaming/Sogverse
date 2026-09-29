import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

/**
 * The eyebrow badge that names a My SOG card's kind of seat when it is not an
 * ordinary assignment — "Substitution", "Trainee".
 *
 * One component so the kinds cannot drift apart in size or tone: they answer
 * the same question — what is this card, before which club it is — and a gedu
 * sweeping the grid reads them as a set. Info is the tone because the grammar
 * has no family for a seat kind, and the fact is informational, not a status
 * a gedu has to act on.
 */
export function SeatKindBadge({ children }: { children: ReactNode }) {
  return (
    <Badge
      variant="outline"
      className="px-2 py-0 text-[10px] uppercase tracking-wide text-info"
    >
      {children}
    </Badge>
  );
}
