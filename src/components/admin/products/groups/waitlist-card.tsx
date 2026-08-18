"use client";

import { useDroppable } from "@dnd-kit/core";
import { Hourglass } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GamePlatform } from "@/lib/constants/game-platforms";
import type { GroupParticipationDetail } from "@/types";
import { ParticipantChip } from "./participant-chip";
import { chipGameIdentity, type RobloxRenderMap } from "./panel-rules";

interface WaitlistCardProps {
  /** Waitlisted gamers in derived order (waitlisted_at, id) — already ordered. */
  participations: GroupParticipationDetail[];
  /** participation ids with an in-flight transition (greyed/undraggable). */
  pendingChipIds: Set<string>;
  /** Which identity this product's chips draw, or null for a topic with none. */
  gamePlatform: GamePlatform | null;
  /** The panel's one batched Roblox lookup; undefined until it lands. */
  robloxRenders: RobloxRenderMap | undefined;
}

/**
 * The admin waitlist section. Renders the product's waitlisted gamers as a
 * numbered 1..N list (position = derived order, computed here as the array
 * index + 1 — never stored), reusing the same draggable ParticipantChip as the groups
 * and unassigned inbox. Two things an admin can do from here, both via drag:
 *  - drag a chip OUT to a group / the unassigned inbox → promote (seat them), or
 *    to the header's remove zone → cancel them off the product entirely;
 *  - drop an active gamer ONTO this card → demote them to the back of the line.
 * This whole section is only rendered for a product that opens a waitlist (any
 * type, any billing), so every chip shown here is genuinely draggable. Whether
 * a given drag is *allowed* is the panel's call: promoting a waitlister who
 * never paid onto a paid product is refused with an explanation.
 */
export function WaitlistCard({
  participations,
  pendingChipIds,
  gamePlatform,
  robloxRenders,
}: WaitlistCardProps) {
  const t = useTranslations("admin.products.groupsPanel");
  const { setNodeRef, isOver } = useDroppable({
    id: "waitlist-target",
    data: { waitlist: true },
  });

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        "border-dashed transition-colors",
        isOver && "border-primary bg-primary/5",
      )}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Hourglass className="h-5 w-5 text-muted-foreground" />
          {t("waitlist.title")}
          {participations.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {participations.length}
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("waitlist.subtitle")}</p>
      </CardHeader>
      <CardContent>
        {participations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("waitlist.empty")}</p>
        ) : (
          <ol className="space-y-2">
            {participations.map((p, index) => (
              <li key={p.id} className="flex items-center gap-2.5">
                {/* tabular-nums keeps the rank column from reflowing as the
                    list grows past single digits. */}
                <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                {/* The chip keeps its natural, content-driven width — the same
                    size it is in a group or the unassigned inbox, so it doesn't
                    visibly resize when dragged between sections. */}
                <ParticipantChip
                  participationId={p.id}
                  participantId={p.participant_id}
                  participantEmail={p.participant_email}
                  firstName={p.participant_first_name}
                  dateOfBirth={p.participant_date_of_birth}
                  gender={p.participant_gender}
                  parentFirstName={p.parent_first_name}
                  parentLastName={p.parent_last_name}
                  {...chipGameIdentity(p, gamePlatform, robloxRenders)}
                  isPending={pendingChipIds.has(p.id)}
                />
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
