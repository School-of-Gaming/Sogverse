"use client";

import { useTranslations } from "next-intl";
import { useMyGroups } from "@/services/groups";
import { useGroupsWithVoice } from "@/hooks/use-groups-page";
import { GroupsListContent } from "@/components/groups/GroupsListContent";
import { ROUTES } from "@/lib/constants";

export function GeduGroupsPageContent() {
  const { groups, isLoading: groupsLoading, error } = useGroupsWithVoice(useMyGroups());
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
        },
      ]}
      heading={t("yourGroupsHeading")}
      subheading={t("yourGroupsSubheading")}
      emptyText={t("yourGroupsEmpty")}
      detailRoute={ROUTES.gedu.group}
    />
  );
}
