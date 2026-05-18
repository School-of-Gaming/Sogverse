"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Radio, Users } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { JoinButton } from "@/components/ui/join-button";
import { GroupVoiceStatus } from "@/components/ui/group-card";
import { PadletLink } from "@/components/ui/padlet-link";
import { computeAge, formatScheduleLocal } from "@/lib/utils";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { useTimezone } from "@/providers";
import type { GroupWithVoice } from "@/hooks/use-groups-page";

interface GroupDetailContentProps {
  groups: GroupWithVoice[];
  groupId: string;
  isLoading: boolean;
  error: Error | null;
  backHref: string;
}

/**
 * Shared detail page for v1 groups (admin, gedu, customer).
 *
 * The Join button is rendered disabled — the v1 voice room flow has been
 * deleted and there's no in-page way to join from here anymore. The card
 * still shows the live/upcoming status (driven by `useGroupsWithVoice`)
 * because removing the entire voice strip would require a redesign; the
 * TODO.md "Tear out the v1 groups UI now that its voice surface is a
 * no-op" item tracks the follow-up.
 */
export function GroupDetailContent({
  groups,
  groupId,
  isLoading,
  error,
  backHref,
}: GroupDetailContentProps) {
  const t = useTranslations('groups');
  const c = useTranslations('common');
  const locale = useLocale();
  const timeZone = useTimezone();

  const group = useMemo(
    () => groups.find((g) => g.groupId === groupId) ?? null,
    [groups, groupId],
  );

  const schedule = useMemo(() => {
    if (!group) return null;
    return formatScheduleLocal(group.dayOfWeek, group.startTime, group.timezone, locale);
  }, [group, locale]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {error.message}
      </p>
    );
  }

  if (!group) {
    return (
      <div className="space-y-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToGroups')}
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">{t('groupNotFound')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('backToGroups')}
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <ProductThumbnail
            imagePath={group.productImagePath}
            alt={group.productName}
            size="h-24 w-24"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{group.productName}</h1>
              <Badge className="shrink-0">
                {group.gameName}
              </Badge>
              {group.voiceIsOpen && (
                <Badge className="bg-success/10 text-success text-xs shrink-0">
                  <Radio className="mr-1 h-3 w-3" />
                  {t('live')}
                </Badge>
              )}
            </div>
            <div className="mt-1">
              <GroupVoiceStatus
                nextSessionStart={group.voiceNextSessionStart}
              />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {schedule && (
                <>{c('schedule', { day: schedule.localDay, time: schedule.localTime, tz: schedule.tzAbbrev })}</>
              )}
              {/* eslint-disable-next-line i18next/no-literal-string -- middle-dot separator, same in every locale */}
              {schedule && group.durationMinutes && " · "}
              {group.durationMinutes && <>{group.durationMinutes} {c('minutes')}</>}
              {/* eslint-disable-next-line i18next/no-literal-string -- middle-dot separator, same in every locale */}
              {(schedule || group.durationMinutes) && " · "}
              <>{c('ages', { min: group.productMinAge, max: group.productMaxAge })}</>
            </p>
            {group.productPadletUrl && (
              <PadletLink href={group.productPadletUrl} />
            )}
          </div>
        </div>
        <JoinButton onClick={() => {}} disabled />
      </div>

      {/* Gamers Roster */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Avatar className="h-8 w-8">
                <Identicon id={group.geduId} size={32} />
              </Avatar>
              {group.geduName}
            </CardTitle>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {t('gamerCount', { count: group.gamers.length })}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {group.gamers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('noGamersEnrolled')}
            </p>
          ) : (
            <div className="divide-y">
              {group.gamers.map((gamer) => (
                <div
                  key={gamer.gamerId}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <Identicon id={gamer.gamerId} size={32} />
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{gamer.firstName}</p>
                      {gamer.dateOfBirth && gamer.gender && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{t('age', { age: computeAge(gamer.dateOfBirth, timeZone) })}</span>
                          <span className="capitalize">{gamer.gender.replace("_", " ")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
