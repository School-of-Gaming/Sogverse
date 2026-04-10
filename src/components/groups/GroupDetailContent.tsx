"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Coins, Loader2, Radio, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { Button } from "@/components/ui/button";
import { JoinButton } from "@/components/ui/join-button";
import { GroupVoiceStatus } from "@/components/ui/group-card";
import { PadletLink } from "@/components/ui/padlet-link";
import { computeAge, formatScheduleLocal } from "@/lib/utils";
import { getRefundEligibility } from "@/lib/enrollment";
import { useCurrency } from "@/hooks/use-currency";
import { UnenrollDialog } from "@/components/enrollment/unenroll-dialog";
import type { GroupWithVoice } from "@/hooks/use-groups-page";

/** Customer enrollment context — all-or-nothing. Built by the parent. */
export interface CustomerEnrollmentContext {
  enrollmentId: string;
  tokenCost: number;
  gamerDisplayName: string;
  lastChargeSessionDate: string | null;
}

interface GroupDetailContentBase {
  groups: GroupWithVoice[];
  groupId: string;
  isLoading: boolean;
  error: Error | null;
  backHref: string;
  customerEnrollment?: CustomerEnrollmentContext;
}

interface GroupDetailWithVoiceRoute extends GroupDetailContentBase {
  voiceRoute: (roomId: string) => string;
  onJoinClick?: never;
}

interface GroupDetailWithJoinClick extends GroupDetailContentBase {
  voiceRoute?: never;
  onJoinClick: () => void;
}

type GroupDetailContentProps = GroupDetailWithVoiceRoute | GroupDetailWithJoinClick;

export function GroupDetailContent({
  groups,
  groupId,
  isLoading,
  error,
  backHref,
  voiceRoute,
  onJoinClick,
  customerEnrollment,
}: GroupDetailContentProps) {
  const t = useTranslations('groups');
  const c = useTranslations('common');
  const router = useRouter();
  const { locale } = useCurrency();
  const [unenrollRefund, setUnenrollRefund] = useState<{
    eligible: boolean;
    reason?: "within_window" | "session_past";
  } | null>(null);

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
          <div className="flex h-24 w-24 shrink-0 items-center justify-center">
            <Image
              src={group.productImageUrl}
              alt={group.productName}
              width={96}
              height={96}
              unoptimized
              className="h-auto w-auto max-h-full max-w-full rounded-md"
            />
          </div>
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
                locale={locale}
              />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {schedule && (
                <>{c('schedule', { day: schedule.localDay, time: schedule.localTime, tz: schedule.tzAbbrev })}</>
              )}
              {/* eslint-disable-next-line i18next/no-literal-string */}
              {schedule && group.durationMinutes && " · "}
              {group.durationMinutes && <>{group.durationMinutes} {c('minutes')}</>}
              {/* eslint-disable-next-line i18next/no-literal-string */}
              {(schedule || group.durationMinutes) && " · "}
              <>{c('ages', { min: group.productMinAge, max: group.productMaxAge })}</>
            </p>
            {group.productPadletUrl && (
              <PadletLink href={group.productPadletUrl} />
            )}
          </div>
        </div>
        {onJoinClick
          ? <JoinButton onClick={onJoinClick} disabled={!group.voiceIsOpen} />
          : <JoinButton href={`${voiceRoute!(group.voiceRoomId)}?groupId=${group.groupId}`} disabled={!group.voiceIsOpen} />
        }
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
                      <p className="text-sm font-medium">{gamer.displayName}</p>
                      {gamer.dateOfBirth && gamer.gender && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{t('age', { age: computeAge(gamer.dateOfBirth) })}</span>
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

      {/* Enrollment info (customer only) */}
      {customerEnrollment && (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2 text-sm">
              <Coins className="h-4 w-4 text-muted-foreground" />
              <span>{t('sorgsPerWeek', { cost: customerEnrollment.tokenCost })}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const refund = getRefundEligibility({
                  product: {
                    day_of_week: group.dayOfWeek,
                    start_time: group.startTime,
                    timezone: group.timezone,
                    token_cost: customerEnrollment.tokenCost,
                  },
                  lastChargeSessionDate: customerEnrollment.lastChargeSessionDate,
                });
                setUnenrollRefund({ eligible: refund.eligible, reason: refund.reason });
              }}
            >
              {t('unenrollGamer', { name: customerEnrollment.gamerDisplayName })}
            </Button>
          </CardContent>
        </Card>
      )}

      {unenrollRefund && customerEnrollment && (
        <UnenrollDialog
          enrollmentId={customerEnrollment.enrollmentId}
          productName={group.productName}
          gamerDisplayName={customerEnrollment.gamerDisplayName}
          tokenCost={customerEnrollment.tokenCost}
          refundEligible={unenrollRefund.eligible}
          refundDenialReason={unenrollRefund.reason}
          onClose={() => setUnenrollRefund(null)}
          onSuccess={() => router.push(backHref)}
        />
      )}
    </div>
  );
}
