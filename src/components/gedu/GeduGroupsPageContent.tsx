"use client";

import { useMyGroups } from "@/services/groups";
import { useLoungeRoomId } from "@/services/voice";
import { useGroupsWithVoice } from "@/hooks/use-groups-page";
import { GroupsListContent } from "@/components/groups/GroupsListContent";
import { ROUTES } from "@/lib/constants";

export function GeduGroupsPageContent() {
  const { groups, isLoading: groupsLoading, error } = useGroupsWithVoice(useMyGroups());
  const { data: geduLoungeId } = useLoungeRoomId("gedu_only");

  return (
    <GroupsListContent
      groups={groups}
      isLoading={groupsLoading}
      error={error}
      lounges={[
        {
          name: "Gedu Lounge",
          description: "Connect with other educators anytime",
          joinHref: geduLoungeId ? ROUTES.gedu.voiceSession(geduLoungeId) : null,
        },
      ]}
      heading="Your Groups"
      subheading="Your assigned groups, students, and voice sessions."
      emptyText="Groups will appear here when an admin assigns you to a product."
      voiceRoute={ROUTES.gedu.voiceSession}
      detailRoute={ROUTES.gedu.group}
    />
  );
}
