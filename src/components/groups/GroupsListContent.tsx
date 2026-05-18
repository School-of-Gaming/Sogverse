"use client";

import { useMemo } from "react";
import { Loader2, Users } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { GroupCard } from "@/components/ui/group-card";
import { LoungeCard } from "@/components/ui/lounge-card";
import { formatScheduleLocal } from "@/lib/utils";
import type { GroupWithVoice } from "@/hooks/use-groups-page";

export interface LoungeConfig {
  name: string;
  description: string;
}

interface GroupsListContentProps {
  groups: GroupWithVoice[];
  isLoading: boolean;
  error: Error | null;
  lounges: LoungeConfig[];
  heading: string;
  subheading: string;
  emptyText: string;
  detailRoute: (groupId: string) => string;
}

/**
 * Shared listing for the admin and gedu groups pages. The Join button on
 * each card is no-op (disabled) — the v1 voice room system that backed
 * these surfaces has been deleted; see TODO.md "Tear out the v1 groups
 * UI now that its voice surface is a no-op" for the follow-up cleanup
 * that removes this component along with its callers.
 */
export function GroupsListContent({
  groups,
  isLoading,
  error,
  lounges,
  heading,
  subheading,
  emptyText,
  detailRoute,
}: GroupsListContentProps) {
  const t = useTranslations('groups');
  const locale = useLocale();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{subheading}</p>
      </div>

      {lounges.map((lounge) => (
        <LoungeCard
          key={lounge.name}
          name={lounge.name}
          description={lounge.description}
        />
      ))}

      <div className="space-y-3">
        {lounges.length > 0 && (
          <h2 className="text-lg font-semibold">{heading}</h2>
        )}

        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : error ? (
          <p className="text-sm text-destructive">
            {error.message}
          </p>
        ) : groups.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">{t('noGroupsYet')}</h3>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                {emptyText}
              </p>
            </CardContent>
          </Card>
        ) : (
          groups.map((group) => (
            <GroupCardAdapter
              key={group.groupId}
              group={group}
              locale={locale}
              detailRoute={detailRoute}
            />
          ))
        )}
      </div>
    </div>
  );
}

function GroupCardAdapter({
  group,
  locale,
  detailRoute,
}: {
  group: GroupWithVoice;
  locale: string;
  detailRoute: (groupId: string) => string;
}) {
  const schedule = useMemo(
    () => formatScheduleLocal(group.dayOfWeek, group.startTime, group.timezone, locale),
    [group.dayOfWeek, group.startTime, group.timezone, locale],
  );

  return (
    <GroupCard
      productName={group.productName}
      productImagePath={group.productImagePath}
      geduName={group.geduName}
      gamerCount={group.gamers.length}
      schedule={schedule}
      voiceIsOpen={group.voiceIsOpen}
      voiceNextSessionStart={group.voiceNextSessionStart}
      detailHref={detailRoute(group.groupId)}
    />
  );
}
