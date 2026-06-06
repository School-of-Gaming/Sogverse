"use client";

import { useDroppable } from "@dnd-kit/core";
import { Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GroupParticipationDetail } from "@/types";
import { GamerChip } from "./gamer-chip";

interface UnassignedCardProps {
  participations: GroupParticipationDetail[];
  /** participation ids with an in-flight move (greyed/undraggable). */
  pendingMoveIds: Set<string>;
}

export function UnassignedCard({
  participations,
  pendingMoveIds,
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
        isOver && "border-primary bg-primary/5",
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
              <GamerChip
                key={p.id}
                participationId={p.id}
                gamerId={p.gamer_id}
                firstName={p.gamer_first_name}
                dateOfBirth={p.gamer_date_of_birth}
                gender={p.gamer_gender}
                parentFirstName={p.gamer_parent_first_name}
                parentLastName={p.gamer_parent_last_name}
                minecraftUsername={p.gamer_minecraft_username}
                minecraftUuid={p.gamer_minecraft_uuid}
                isPending={pendingMoveIds.has(p.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
