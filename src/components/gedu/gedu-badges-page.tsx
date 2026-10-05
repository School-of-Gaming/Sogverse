"use client";

import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { BadgeArt } from "@/components/badges/badge-art";
import { StatusLine } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import {
  GEDU_BADGES,
  useGeduBadges,
  type HeldGeduBadge,
} from "@/services/gedu";
import type { GeduBadge } from "@/types";

/**
 * `/gedu/badges` — the educator's badge case: every badge there is, in the
 * canonical order, earned ones in colour with the day they were earned and the
 * rest greyed.
 *
 * Every badge is shown, not only the held ones, because the case is also how
 * an educator learns what there is to earn. Who granted a badge is never shown
 * here: the educator's own read cannot see another account's profile, and the
 * badge is awarded by School of Gaming rather than by a person.
 *
 * Seeded by the route's server read. `null` means that read failed: the case
 * draws nothing while the browser asks again, because greying every badge on
 * the strength of a read that did not land would tell an educator they hold
 * none of them.
 */
export function GeduBadgesPage({
  geduId,
  initialBadges,
}: {
  geduId: string;
  initialBadges: HeldGeduBadge[] | null;
}) {
  const t = useTranslations("gedu.badges");
  const { data: held, isError } = useGeduBadges(geduId, {
    initialData: initialBadges ?? undefined,
  });

  return (
    // Reserved like the gedu's other destinations, so moving between them
    // never shifts the page sideways by a scrollbar's width.
    <div className="mx-auto max-w-5xl space-y-10 pb-24" data-reserve-scroll-gutter>
      <div className="space-y-6">
        {/* The way back, because below `lg` this page is reached from the
            account menu and is not a place on the strip. */}
        <Link
          href={ROUTES.gedu.dashboard}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("back")}
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{t("pageTitle")}</h1>
          <p className="max-w-prose text-muted-foreground">{t("intro")}</p>
        </div>
      </div>

      {held === undefined ? (
        isError ? (
          <StatusLine status="destructive">{t("loadError")}</StatusLine>
        ) : null
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GEDU_BADGES.map((badge) => (
            <li key={badge}>
              <BadgeCaseItem
                badge={badge}
                held={held.find((row) => row.badge === badge) ?? null}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One badge in the case, earned or not. Both states are the same shape. */
function BadgeCaseItem({
  badge,
  held,
}: {
  badge: GeduBadge;
  held: HeldGeduBadge | null;
}) {
  const t = useTranslations("gedu.badges");
  const bt = useTranslations("badges.gedu");
  const locale = useLocale();
  const timeZone = useTimezone();

  return (
    <Card className="h-full">
      <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
        <BadgeArt badge={badge} earned={held !== null} size="lg" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{bt(`${badge}.name`)}</h2>
          <p className="text-sm font-medium text-muted-foreground">
            {held === null
              ? t("notEarned")
              : t("earnedOn", {
                  date: formatDate(held.granted_at, locale, {
                    dateStyle: "long",
                    timeZone,
                  }),
                })}
          </p>
        </div>
        <p className="text-sm">{t(badge)}</p>
        <p className="text-xs text-muted-foreground">{t("awardedBy")}</p>
      </CardContent>
    </Card>
  );
}
