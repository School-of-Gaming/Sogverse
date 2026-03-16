"use client";

import { GroupsListContent } from "@/components/groups/GroupsListContent";
import { useGeduGroupsPage } from "@/hooks/use-gedu-groups-page";
import { ROUTES } from "@/lib/constants";

export function GeduGroupsPageContent() {
  const { groups, loungeRoomId, isLoading, error } = useGeduGroupsPage();

  return (
    <GroupsListContent
      groups={groups}
      isLoading={isLoading}
      error={error}
      lounges={[
        {
          name: "Gedu Lounge",
          description: "Connect with other educators anytime",
          joinHref: loungeRoomId ? ROUTES.gedu.voice(loungeRoomId) : null,
        },
      ]}
      heading="Your Groups"
      subheading="Your assigned groups, students, and voice sessions."
      emptyText="Groups will appear here when an admin assigns you to a product."
      voiceRoute={ROUTES.gedu.voice}
      detailRoute={ROUTES.gedu.group}
    />
  );
}
