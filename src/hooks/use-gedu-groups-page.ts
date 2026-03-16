"use client";

import { useMyGroups } from "@/services/groups";
import { useLoungeRoomId } from "@/services/voice";
import { useGroupsWithVoice } from "@/hooks/use-groups-page";
export type { GroupWithVoice } from "@/hooks/use-groups-page";

export function useGeduGroupsPage() {
  const groupsQuery = useMyGroups();
  const { groups, isLoading: groupsLoading, error } = useGroupsWithVoice(groupsQuery);
  const { data: loungeRoomId, isLoading: loungeLoading } = useLoungeRoomId("gedu_only");

  return {
    groups,
    loungeRoomId: loungeRoomId ?? null,
    isLoading: groupsLoading || loungeLoading,
    error,
  };
}
