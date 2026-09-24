"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { PersonChip } from "@/components/ui/person-chip";
import { cn } from "@/lib/utils";
import type { SubstitutedSession } from "./admin-substitutions-data";
import {
  OpenGroupLink,
  SubstitutionAwayLine,
  SubstitutionSessionHeading,
} from "./substitution-session-lines";

/**
 * One upcoming session that already has a substitute: the session, who is
 * away, who stands in, and who seated them.
 *
 * It opens with the open card's own two lines, so a session reads the same
 * before and after it is staffed, and an admin checking what they approved
 * finds it by the words they approved it under. The urgency edge is the same
 * rule as well.
 *
 * **No actions.** Changing or clearing a substitute is the group page's job,
 * where the whole session's staffing is in view, so this card carries only the
 * way there — the same link an open request with no offers points at.
 */
export function SubstitutedSessionRow({
  session,
  now,
}: {
  session: SubstitutedSession;
  /** The page's pinned clock — what both relative phrases are measured against. */
  now: Date;
}) {
  const t = useTranslations("admin.substitutions");
  const format = useFormatter();

  return (
    <Card className={cn(session.urgent && "border-l-4 border-l-warning")}>
      <CardContent className="space-y-3 p-4">
        <SubstitutionSessionHeading session={session} now={now} />
        <SubstitutionAwayLine session={session} />

        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="text-muted-foreground">{t("substitute")}</span>
            <PersonChip
              id={session.substituteId}
              name={session.substituteName ?? t("unnamed")}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <p className="text-xs text-muted-foreground">
              {t("approvedBy", {
                name: session.approverFirstName,
                when: format.relativeTime(session.approvedAt, now),
              })}
            </p>
            <OpenGroupLink href={session.groupHref} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
