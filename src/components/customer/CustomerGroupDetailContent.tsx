"use client";

import { useMemo, useState } from "react";
import { useMyGroups } from "@/services/groups";
import { useMyGamers } from "@/services/gamers";
import { useGroupsWithVoice } from "@/hooks/use-groups-page";
import { GroupDetailContent, type CustomerEnrollmentContext } from "@/components/groups/GroupDetailContent";
import { SwitchToGamerDialog } from "@/components/customer/SwitchToGamerDialog";
import { ROUTES } from "@/lib/constants";
import type { GroupWithVoice } from "@/hooks/use-groups-page";

interface CustomerGroupDetailContentProps {
  groupId: string;
  gamerId: string;
}

/**
 * Build the customer enrollment context by cross-referencing the group roster
 * with the customer's gamers. Returns undefined if the customer has no gamer
 * in this group.
 */
export function buildCustomerEnrollment(
  group: GroupWithVoice,
  gamers: { id: string; display_name: string }[],
  targetGamerId: string,
): CustomerEnrollmentContext | undefined {
  const myGamerIds = new Set(gamers.map((g) => g.id));
  const myGamer = group.gamers.find(
    (gg) => gg.gamerId === targetGamerId && myGamerIds.has(gg.gamerId),
  );
  if (!myGamer) return undefined;

  const gamer = gamers.find((g) => g.id === myGamer.gamerId);

  return {
    enrollmentId: myGamer.enrollmentId,
    tokenCost: group.productTokenCost ?? 0,
    gamerDisplayName: gamer?.display_name ?? myGamer.displayName,
    lastChargeSessionDate: myGamer.lastChargeSessionDate,
  };
}

export function CustomerGroupDetailContent({ groupId, gamerId }: CustomerGroupDetailContentProps) {
  const { groups, isLoading: groupsLoading, error: groupsError } = useGroupsWithVoice(useMyGroups());
  const { data: gamers, isLoading: gamersLoading, error: gamersError } = useMyGamers();
  const [showSwitchDialog, setShowSwitchDialog] = useState(false);

  const group = groups.find((g) => g.groupId === groupId);

  const customerEnrollment = useMemo(() => {
    if (!group || !gamers) return undefined;
    return buildCustomerEnrollment(group, gamers, gamerId);
  }, [groups, groupId, gamers, gamerId]);

  const gamerDisplayName = customerEnrollment?.gamerDisplayName ?? "Gamer";

  return (
    <>
      <GroupDetailContent
        groups={groups}
        groupId={groupId}
        isLoading={groupsLoading || gamersLoading}
        error={groupsError ?? gamersError}
        backHref={ROUTES.customer.gamers}
        onJoinClick={() => setShowSwitchDialog(true)}
        customerEnrollment={customerEnrollment}
      />

      {group && (
        <SwitchToGamerDialog
          open={showSwitchDialog}
          onOpenChange={setShowSwitchDialog}
          gamerId={gamerId}
          gamerDisplayName={gamerDisplayName}
          redirectUrl={`${ROUTES.gamer.voiceSession(group.voiceRoomId)}?groupId=${group.groupId}`}
        />
      )}
    </>
  );
}
