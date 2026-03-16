"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMyGroups } from "@/services/groups";
import { useMyGamers } from "@/services/gamers";
import { useGroupsWithVoice } from "@/hooks/use-groups-page";
import { GroupDetailContent, type EnrollmentInfo } from "@/components/groups/GroupDetailContent";
import { ROUTES } from "@/lib/constants";

interface CustomerGroupDetailContentProps {
  groupId: string;
}

export function CustomerGroupDetailContent({ groupId }: CustomerGroupDetailContentProps) {
  const { groups, isLoading: groupsLoading, error: groupsError } = useGroupsWithVoice(useMyGroups());
  const { data: gamers, isLoading: gamersLoading } = useMyGamers();
  const [showJoinAlert, setShowJoinAlert] = useState(false);

  const group = useMemo(
    () => groups.find((g) => g.groupId === groupId) ?? null,
    [groups, groupId],
  );

  // Find the customer's gamer in this group to build enrollment info
  const enrollment: EnrollmentInfo | undefined = useMemo(() => {
    if (!group || !gamers) return undefined;

    const myGamerIds = new Set(gamers.map((g) => g.id));
    const myGamer = group.gamers.find((gg) => myGamerIds.has(gg.gamerId));
    if (!myGamer) return undefined;

    const gamer = gamers.find((g) => g.id === myGamer.gamerId);

    return {
      enrollmentId: myGamer.enrollmentId,
      tokenCost: group.productTokenCost ?? 0,
      gamerDisplayName: gamer?.display_name ?? myGamer.displayName,
      lastChargeSessionDate: myGamer.lastChargeSessionDate,
    };
  }, [group, gamers]);

  return (
    <>
      <GroupDetailContent
        groups={groups}
        groupId={groupId}
        isLoading={groupsLoading || gamersLoading}
        error={groupsError}
        backHref={ROUTES.customer.gamers}
        onJoinClick={() => setShowJoinAlert(true)}
        enrollment={enrollment}
      />

      <Dialog open={showJoinAlert} onOpenChange={setShowJoinAlert}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Voice Chat Coming Soon</DialogTitle>
            <DialogDescription>
              Parent voice chat access is not yet available. Your gamer can join
              the session from their own account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowJoinAlert(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
