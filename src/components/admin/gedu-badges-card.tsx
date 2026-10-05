"use client";

/**
 * Admin control to grant and revoke a gedu's badges, shown on the gedu's
 * /admin/users/[id] page directly after the certification card.
 *
 * One row per badge, in the canonical order, each with its art, its name, what
 * it qualifies the educator for, and a checkbox. Ticking grants and unticking
 * revokes, in one click and with no confirmation — the same interaction the
 * criminal record check uses, for the same reason: it records a standing fact
 * about a person, and taking it back has to be as plain as setting it. Badges
 * gate nothing (`services/gedu/CLAUDE.md`), so there is nothing to warn about.
 *
 * Seeded with a server-fetched `initial` list so it paints complete on first
 * frame. `null` means that read failed: the rows still draw their art and
 * words, and the checkbox and the granted line arrive once the browser's own
 * read answers, because a box drawn unticked on the strength of a read that did
 * not land would state that the educator does not hold the badge.
 *
 * **The checkbox is the row's trailing control and the granted line its last
 * line.** Ticking changes exactly one node — the granted line's words — so the
 * box an admin just clicked stays under the cursor.
 */

import { useId, useState } from "react";
import { Award } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { BadgeArt } from "@/components/badges/badge-art";
import { StatusLine } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  GEDU_BADGES,
  useGeduBadges,
  useSetGeduBadge,
  type HeldGeduBadge,
} from "@/services/gedu";
import { useTimezone } from "@/providers";
import type { GeduBadge } from "@/types";
import { formatDate } from "@/lib/utils";

interface GeduBadgesCardProps {
  geduId: string;
  /** The gedu's badges as the page read them, or `null` where that read failed. */
  initial: HeldGeduBadge[] | null;
}

export function GeduBadgesCard({ geduId, initial }: GeduBadgesCardProps) {
  const t = useTranslations("admin.geduBadges");
  const { data: held } = useGeduBadges(geduId, {
    initialData: initial ?? undefined,
  });
  const setBadge = useSetGeduBadge();
  // Per badge, because two rows can be in flight at once and one row's write
  // must not disable — or re-enable — the other's box.
  const [committing, setCommitting] = useState<ReadonlySet<GeduBadge>>(
    () => new Set(),
  );
  const [failed, setFailed] = useState<GeduBadge | null>(null);

  /**
   * Grant or revoke one badge. The flag is live before any render after the
   * click and cleared once the write settles either way: the checkbox stays on
   * the page through both outcomes, so there is no unmount to hand it off to.
   * `mutateAsync` settles only after the badges have been refetched, so the box
   * re-enables already showing the value it was set to.
   */
  function toggle(badge: GeduBadge, next: boolean) {
    setFailed(null);
    setCommitting((current) => new Set(current).add(badge));
    void setBadge
      .mutateAsync({ geduId, badge, held: next })
      .catch(() => setFailed(badge))
      .finally(() =>
        setCommitting((current) => {
          const rest = new Set(current);
          rest.delete(badge);
          return rest;
        }),
      );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5 text-act" aria-hidden />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {GEDU_BADGES.map((badge) => (
          <GeduBadgeRow
            key={badge}
            badge={badge}
            held={
              held === undefined
                ? undefined
                : (held.find((row) => row.badge === badge) ?? null)
            }
            busy={committing.has(badge)}
            failed={failed === badge}
            errorMessage={
              setBadge.error instanceof Error ? setBadge.error.message : t("error")
            }
            onToggle={(next) => toggle(badge, next)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function GeduBadgeRow({
  badge,
  held,
  busy,
  failed,
  errorMessage,
  onToggle,
}: {
  badge: GeduBadge;
  /** The held row, `null` when not held, `undefined` while unanswered. */
  held: HeldGeduBadge | null | undefined;
  busy: boolean;
  failed: boolean;
  errorMessage: string;
  onToggle: (next: boolean) => void;
}) {
  const t = useTranslations("admin.geduBadges");
  const bt = useTranslations("badges.gedu");
  const locale = useLocale();
  const timeZone = useTimezone();
  const checkboxId = useId();

  const grantedLine =
    held == null
      ? t("notGranted")
      : (() => {
          const date = formatDate(held.granted_at, locale, {
            dateStyle: "long",
            timeZone,
          });
          const name = personName(held.granter);
          return name
            ? t("grantedOnBy", { date, name })
            : t("grantedOn", { date });
        })();

  return (
    <div className="space-y-2 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <BadgeArt badge={badge} earned={held != null} size="sm" />
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor={checkboxId} className="block cursor-pointer font-medium">
            {bt(`${badge}.name`)}
          </label>
          <p className="text-sm text-muted-foreground">{t(badge)}</p>
          {held !== undefined && (
            <p className="text-sm text-muted-foreground">{grantedLine}</p>
          )}
        </div>
        {/* Trailing, so its arrival after a failed server read lands in the
            row's own slack and moves nothing already painted. */}
        {held !== undefined && (
          <Checkbox
            id={checkboxId}
            className="mt-1"
            checked={held !== null}
            disabled={busy}
            onChange={(event) => onToggle(event.target.checked)}
          />
        )}
      </div>
      {failed && <StatusLine status="destructive">{errorMessage}</StatusLine>}
    </div>
  );
}

/**
 * The granting admin's display name, or `null` where there is none to give —
 * a departed admin (`ON DELETE SET NULL`) or a profile with no name on it.
 */
function personName(
  person: { first_name: string | null; last_name: string | null } | null,
): string | null {
  if (!person) return null;
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ");
  return name === "" ? null : name;
}
