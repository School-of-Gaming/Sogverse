"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Calendar, Clock, Users, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CustomerEnrollment } from "@/services/enrollments";
import { getNextSessionStart, getRefundEligibility, formatCountdown } from "@/lib/enrollment";
import { formatScheduleLocal } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { UnenrollDialog } from "./unenroll-dialog";

interface EnrollmentCardProps {
  enrollment: CustomerEnrollment;
}

export function EnrollmentCard({ enrollment }: EnrollmentCardProps) {
  const [showUnenroll, setShowUnenroll] = useState(false);

  const schedule = formatScheduleLocal(
    enrollment.productDayOfWeek,
    enrollment.productStartTime,
    enrollment.productTimezone,
  );

  const nextSession = getNextSessionStart(
    enrollment.productDayOfWeek,
    enrollment.productStartTime,
    enrollment.productTimezone,
  );

  const { eligible: refundEligible, reason: refundDenialReason } = getRefundEligibility(
    {
      day_of_week: enrollment.productDayOfWeek,
      start_time: enrollment.productStartTime,
      timezone: enrollment.productTimezone,
      token_cost: enrollment.productTokenCost,
    },
    undefined,
    undefined,
    enrollment.lastChargeSessionDate ?? null,
  );

  const isActive = enrollment.status === "active";

  const msUntil = nextSession.getTime() - Date.now();
  const totalMinutes = Math.max(0, Math.floor(msUntil / 60_000));
  const countdown = formatCountdown(msUntil);

  return (
    <>
      <Card className={!isActive ? "opacity-60" : undefined}>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
          {/* Product image */}
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md bg-muted sm:h-28 sm:w-28">
            {enrollment.productImageUrl && (
              <Image
                src={enrollment.productImageUrl}
                alt={enrollment.productName}
                fill
                unoptimized
                className="object-cover"
              />
            )}
          </div>

          {/* Details */}
          <div className="flex-1 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link
                  href={`${ROUTES.products}/${enrollment.productId}`}
                  className="font-semibold hover:underline"
                >
                  {enrollment.productName}
                </Link>
                <p className="text-sm text-muted-foreground">
                  Gamer: <span className="font-medium text-foreground">{enrollment.gamerDisplayName}</span>
                </p>
              </div>
              <Badge variant={isActive ? "default" : "secondary"}>
                {isActive ? "Enrolled" : "Unenrolled"}
              </Badge>
            </div>

            {/* Schedule info */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {enrollment.geduDisplayName}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Every {schedule.localDay}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {schedule.localTime} {schedule.tzAbbrev}
              </span>
              <span className="flex items-center gap-1">
                <Coins className="h-3 w-3" />
                {enrollment.productTokenCost} Sorgs/week
              </span>
            </div>

            {/* Active enrollment: next session + refund + unenroll */}
            {isActive && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-sm">
                  Next session {nextSession.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })} <span className={totalMinutes < 720 ? "font-medium text-warning" : "text-muted-foreground"}>(starts in {countdown})</span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUnenroll(true)}
                >
                  Unenroll
                </Button>
              </div>
            )}

            {/* Unenrolled: show date */}
            {!isActive && enrollment.unenrolledAt && (
              <p className="text-xs text-muted-foreground">
                Unenrolled on{" "}
                {new Date(enrollment.unenrolledAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {showUnenroll && (
        <UnenrollDialog
          enrollment={enrollment}
          refundEligible={refundEligible}
          refundDenialReason={refundDenialReason}
          onClose={() => setShowUnenroll(false)}
        />
      )}
    </>
  );
}
