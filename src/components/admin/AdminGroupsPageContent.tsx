"use client";

import { useTranslations } from "next-intl";
import { useMyGroups } from "@/services/groups";
import { useLoungeRoomId } from "@/services/voice";
import { useGroupsWithVoice } from "@/hooks/use-groups-page";
import { GroupsListContent } from "@/components/groups/GroupsListContent";
import { ROUTES } from "@/lib/constants";

export function AdminGroupsPageContent() {
  const { groups, isLoading: groupsLoading, error } = useGroupsWithVoice(useMyGroups());
  const { data: adminLoungeId } = useLoungeRoomId("admin_only");
  const { data: geduLoungeId } = useLoungeRoomId("gedu_only");
  const t = useTranslations("groups");

  return (
    <GroupsListContent
      groups={groups}
      isLoading={groupsLoading}
      error={error}
      lounges={[
        {
          name: t("adminLounge"),
          description: t("adminLoungeDescription"),
          joinHref: adminLoungeId ? ROUTES.admin.voiceSession(adminLoungeId) : null,
        },
        {
          name: t("geduLounge"),
          description: t("geduLoungeDescription"),
          joinHref: geduLoungeId ? ROUTES.admin.voiceSession(geduLoungeId) : null,
        },
      ]}
      heading={t("allGroupsHeading")}
      subheading={t("allGroupsSubheading")}
      emptyText={t("allGroupsEmpty")}
      voiceRoute={ROUTES.admin.voiceSession}
      detailRoute={ROUTES.admin.group}
    />
  );
}
