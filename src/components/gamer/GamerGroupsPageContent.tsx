"use client";

import { useMyGroups } from "@/services/groups";
import { useGroupsWithVoice } from "@/hooks/use-groups-page";
import { GroupsListContent } from "@/components/groups/GroupsListContent";
import { ROUTES } from "@/lib/constants";

export function GamerGroupsPageContent() {
  const { groups, isLoading, error } = useGroupsWithVoice(useMyGroups());

  return (
    <GroupsListContent
      groups={groups}
      isLoading={isLoading}
      error={error}
      lounges={[]}
      heading="My Groups"
      subheading="Your enrolled groups and upcoming voice sessions."
      emptyText="You're not enrolled in any groups yet."
      voiceRoute={ROUTES.gamer.voiceSession}
      detailRoute={ROUTES.gamer.group}
    />
  );
}
