"use client";

import { useDroppable } from "@dnd-kit/core";
import { Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GamePlatform } from "@/lib/constants/game-platforms";
import type { GroupParticipationDetail } from "@/types";
import { ParticipantChip } from "./participant-chip";
import type { RobloxRenderMap } from "@/services/roblox";
import { chipGameIdentity } from "./panel-rules";

interface UnassignedCardProps {
  participations: GroupParticipationDetail[];
  /** participation ids with an in-flight move or removal (greyed/undraggable). */
  pendingChipIds: Set<string>;
  /** Which identity this product's chips draw, or null for a topic with none. */
  gamePlatform: GamePlatform | null;
  /** The panel's one batched Roblox lookup; undefined until it lands. */
  robloxRenders: RobloxRenderMap | undefined;
}

export function UnassignedCard({
  participations,
  pendingChipIds,
  gamePlatform,
  robloxRenders,
}: UnassignedCardProps) {
  const t = useTranslations("admin.products.groupsPanel");
  const { setNodeRef, isOver } = useDroppable({
    id: `group-target-unassigned`,
    // toGroupId=null is the unassigned-inbox sentinel.
    data: { toGroupId: null },
  });

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        "border-dashed transition-colors",
        isOver && "bg-primary/5",
      )}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-5 w-5 text-muted-foreground" />
          {t("unassigned.title")}
          {participations.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {participations.length}
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {t("unassigned.subtitle")}
        </p>
      </CardHeader>
      <CardContent>
        {participations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("unassigned.empty")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {participations.map((p) => (
              <ParticipantChip
                key={p.id}
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
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
