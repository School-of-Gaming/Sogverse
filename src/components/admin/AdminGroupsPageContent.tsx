"use client";

import { useTranslations } from "next-intl";
import { useMyGroups } from "@/services/groups";
import { useGroupsWithVoice } from "@/hooks/use-groups-page";
import { GroupsListContent } from "@/components/groups/GroupsListContent";
import { ROUTES } from "@/lib/constants";

export function AdminGroupsPageContent() {
  const { groups, isLoading: groupsLoading, error } = useGroupsWithVoice(useMyGroups());
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
        },
        {
          name: t("geduLounge"),
          description: t("geduLoungeDescription"),
        },
      ]}
      heading={t("allGroupsHeading")}
      subheading={t("allGroupsSubheading")}
      emptyText={t("allGroupsEmpty")}
      detailRoute={ROUTES.admin.group}
    />
  );
}
