"use client";

import { useMyGroups } from "@/services/groups";
import { useMyGamers } from "@/services/gamers";
import { useGroupsWithVoice } from "@/hooks/use-groups-page";
import { GroupDetailContent } from "@/components/groups/GroupDetailContent";
import { ROUTES } from "@/lib/constants";

interface CustomerGroupDetailContentProps {
  groupId: string;
  /** Route still passes gamerId; ignored here, kept so the URL shape doesn't break callers. Will be removed when the v1 groups UI is torn out (TODO.md). */
  gamerId?: string;
}

/**
 * Parent's view of a v1 group their child is enrolled in.
 *
 * The "Join voice room as my gamer" affordance (which used to trampoline
 * through SwitchToGamerDialog → /api/auth/switch-account → the gamer's
 * v1 voice room URL) is gone with the v1 voice room system. Until the
 * v1 groups UI is fully torn out (see TODO.md), this page shows the same
 * disabled-Join state as the gedu/admin detail page.
 */
export function CustomerGroupDetailContent({ groupId }: CustomerGroupDetailContentProps) {
  const { groups, isLoading: groupsLoading, error: groupsError } = useGroupsWithVoice(useMyGroups());
  const { isLoading: gamersLoading, error: gamersError } = useMyGamers();

  return (
    <GroupDetailContent
      groups={groups}
      groupId={groupId}
      isLoading={groupsLoading || gamersLoading}
      error={groupsError ?? gamersError}
      backHref={ROUTES.customer.gamers}
    />
  );
}
