"use client";

import { useMyGroups } from "@/services/groups";
import { useGroupsWithVoice } from "@/hooks/use-groups-page";
import { GroupDetailContent } from "@/components/groups/GroupDetailContent";
import { ROUTES } from "@/lib/constants";

interface AdminGroupDetailContentProps {
  groupId: string;
}

export function AdminGroupDetailContent({ groupId }: AdminGroupDetailContentProps) {
  const { groups, isLoading, error } = useGroupsWithVoice(useMyGroups());

  return (
    <GroupDetailContent
      groups={groups}
      groupId={groupId}
      isLoading={isLoading}
      error={error}
      backHref={ROUTES.admin.groups}
    />
  );
}
