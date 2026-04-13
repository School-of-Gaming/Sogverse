"use client";

import { useTranslations } from "next-intl";
import { useMyGroups } from "@/services/groups";
import { useLoungeRoomId } from "@/services/voice";
import { useGroupsWithVoice } from "@/hooks/use-groups-page";
import { GroupsListContent } from "@/components/groups/GroupsListContent";
import { ROUTES } from "@/lib/constants";

export function GeduGroupsPageContent() {
  const { groups, isLoading: groupsLoading, error } = useGroupsWithVoice(useMyGroups());
  const { data: geduLoungeId } = useLoungeRoomId("gedu_only");
  const t = useTranslations("groups");

  return (
    <GroupsListContent
      groups={groups}
      isLoading={groupsLoading}
      error={error}
      lounges={[
        {
          name: t("geduLounge"),
          description: t("geduLoungeDescriptionOther"),
          joinHref: geduLoungeId ? ROUTES.gedu.voiceSession(geduLoungeId) : null,
        },
      ]}
      heading={t("yourGroupsHeading")}
      subheading={t("yourGroupsSubheading")}
      emptyText={t("yourGroupsEmpty")}
      voiceRoute={ROUTES.gedu.voiceSession}
      detailRoute={ROUTES.gedu.group}
    />
  );
}
