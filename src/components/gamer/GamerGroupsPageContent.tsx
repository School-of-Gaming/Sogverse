"use client";

import { useTranslations } from "next-intl";
import { useMyGroups } from "@/services/groups";
import { useGroupsWithVoice } from "@/hooks/use-groups-page";
import { GroupsListContent } from "@/components/groups/GroupsListContent";
import { ROUTES } from "@/lib/constants";

export function GamerGroupsPageContent() {
  const { groups, isLoading, error } = useGroupsWithVoice(useMyGroups());
  const t = useTranslations("groups");

  return (
    <GroupsListContent
      groups={groups}
      isLoading={isLoading}
      error={error}
      lounges={[]}
      heading={t("myGroupsHeading")}
      subheading={t("myGroupsSubheading")}
      emptyText={t("myGroupsEmpty")}
      voiceRoute={ROUTES.gamer.voiceSession}
      detailRoute={ROUTES.gamer.group}
    />
  );
}
