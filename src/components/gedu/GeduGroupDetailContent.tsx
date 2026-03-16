"use client";

import { GroupDetailContent } from "@/components/groups/GroupDetailContent";
import { useGeduGroupsPage } from "@/hooks/use-gedu-groups-page";
import { ROUTES } from "@/lib/constants";

interface GeduGroupDetailContentProps {
  groupId: string;
}

export function GeduGroupDetailContent({ groupId }: GeduGroupDetailContentProps) {
  const { groups, isLoading, error } = useGeduGroupsPage();

  return (
    <GroupDetailContent
      groups={groups}
      groupId={groupId}
      isLoading={isLoading}
      error={error}
      backHref={ROUTES.gedu.groups}
      voiceRoute={ROUTES.gedu.voiceSession}
    />
  );
}
