"use client";

import { useState } from "react";
import { useMyGroups } from "@/services/groups";
import { useMyGamers } from "@/services/gamers";
import { useGroupsWithVoice } from "@/hooks/use-groups-page";
import { GroupDetailContent } from "@/components/groups/GroupDetailContent";
import { SwitchToGamerDialog } from "@/components/customer/SwitchToGamerDialog";
import { ROUTES } from "@/lib/constants";

interface CustomerGroupDetailContentProps {
  groupId: string;
  gamerId: string;
}

export function CustomerGroupDetailContent({ groupId, gamerId }: CustomerGroupDetailContentProps) {
  const { groups, isLoading: groupsLoading, error: groupsError } = useGroupsWithVoice(useMyGroups());
  const { data: gamers, isLoading: gamersLoading, error: gamersError } = useMyGamers();
  const [showSwitchDialog, setShowSwitchDialog] = useState(false);

  const group = groups.find((g) => g.groupId === groupId);
  const gamer = gamers?.find((g) => g.id === gamerId);
  const gamerDisplayName = gamer?.first_name ?? "Gamer";

  return (
    <>
      <GroupDetailContent
        groups={groups}
        groupId={groupId}
        isLoading={groupsLoading || gamersLoading}
        error={groupsError ?? gamersError}
        backHref={ROUTES.customer.gamers}
        onJoinClick={() => setShowSwitchDialog(true)}
      />

      {group && (
        <SwitchToGamerDialog
          open={showSwitchDialog}
          onOpenChange={setShowSwitchDialog}
          gamerId={gamerId}
          gamerDisplayName={gamerDisplayName}
          productName={group.productName}
          redirectUrl={`${ROUTES.gamer.voiceSession(group.voiceRoomId)}?groupId=${group.groupId}`}
        />
      )}
    </>
  );
}
