"use client";

import { useMyGroups } from "@/services/groups";
import { useLoungeRoomId } from "@/services/voice";
import { useGroupsWithVoice } from "@/hooks/use-groups-page";
import { GroupsListContent } from "@/components/groups/GroupsListContent";
import { ROUTES } from "@/lib/constants";

export function AdminGroupsPageContent() {
  const { groups, isLoading: groupsLoading, error } = useGroupsWithVoice(useMyGroups());
  const { data: adminLoungeId, isLoading: adminLoungeLoading } = useLoungeRoomId("admin_only");
  const { data: geduLoungeId, isLoading: geduLoungeLoading } = useLoungeRoomId("gedu_only");

  return (
    <GroupsListContent
      groups={groups}
      isLoading={groupsLoading || adminLoungeLoading || geduLoungeLoading}
      error={error}
      lounges={[
        {
          name: "Admin Lounge",
          description: "Private admin voice channel",
          joinHref: adminLoungeId ? ROUTES.admin.voiceSession(adminLoungeId) : null,
        },
        {
          name: "Gedu Lounge",
          description: "Connect with educators anytime",
          joinHref: geduLoungeId ? ROUTES.admin.voiceSession(geduLoungeId) : null,
        },
      ]}
      heading="All Groups"
      subheading="All groups across all products and educators."
      emptyText="No groups have been created yet."
      voiceRoute={ROUTES.admin.voiceSession}
      detailRoute={ROUTES.admin.group}
    />
  );
}
