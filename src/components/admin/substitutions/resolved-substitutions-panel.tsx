"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, CalendarDays, Undo2, Users } from "lucide-react";
import { PersonChip } from "@/components/ui/person-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PRODUCT_TYPE_PRESENTATION } from "@/components/admin/dashboard/product-type-presentation";
import type { ResolvedSubstitution } from "./admin-substitutions-data";

/**
 * **The fortnight behind the queue: who stood in, and where nobody had to.**
 *
 * It answers a question the platform otherwise has no surface for. An approved
 * request leaves the queue above, and the only place still naming its
 * substitute is the group's own page — which an admin has to already know the
 * group to reach, and "who covered Tuesday?" is exactly the question asked by
 * somebody who does not.
 *
 * **Read-only, and quieter than the queue above it.** Nothing here is work; it
 * is a record. So a row is one line rather than a card, with no actions and no
 * offers — the losing offers on a settled request are people who were not
 * picked, a fact about a decision already taken, where what the reader came for
 * is the substitute.
 *
 * **A withdrawal is an answer, not an absence of one.** "The absent gedu is
 * attending after all" is why a session nobody was found for is fine, so it
 * gets its own wording and its own glyph rather than an empty substitute
 * column. The database guarantees the pairing — a withdrawn request cannot
 * carry a sub — so the status is what the row branches on.
 *
 * **Empty renders nothing at all, panel included.** An all-clear here would be
 * announcing that nobody has been away for a fortnight, which is not news an
 * admin opened this page for; the queue above owns this page's one empty state.
 */
export function ResolvedSubstitutionsPanel({
  substitutions,
}: {
  substitutions: readonly ResolvedSubstitution[];
}) {
  const t = useTranslations("admin.substitutions");

  if (substitutions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("recentLabel")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul aria-label={t("recentLabel")} className="space-y-2">
          {substitutions.map((substitution) => (
            <li key={substitution.id}>
              <ResolvedRow substitution={substitution} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** One settled session: when it was, whose it was, and what came of it. */
function ResolvedRow({
  substitution,
}: {
  substitution: ResolvedSubstitution;
}) {
  const t = useTranslations("admin.substitutions");
  const tRole = useTranslations("admin.geduRole");
  const tType = useTranslations("admin.products.types");

  const presentation = PRODUCT_TYPE_PRESENTATION[substitution.productType];
  const TypeIcon = presentation.icon;
  // The id, not a status, because the database pairs the two exactly: a
  // withdrawn request cannot carry a sub and a substituted one always does. So
  // the presence of the substitute is the branch, and there is no second field
  // for the row to disagree with.
  const substituteId = substitution.substituteId;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-lifted px-2.5 py-2 text-xs">
      <TypeIcon
        className={cn("h-3.5 w-3.5 shrink-0", presentation.text)}
        aria-label={tType(`${presentation.i18nKey}.label`)}
      />
      <span className="text-sm font-medium leading-snug">
        {substitution.productName}
      </span>
      <span className="flex items-center gap-1 text-muted-foreground">
        <Users className="h-3 w-3 shrink-0" aria-hidden />
        {substitution.groupName}
      </span>
      <span className="flex items-center gap-1 text-muted-foreground">
        <CalendarDays className="h-3 w-3 shrink-0" aria-hidden />
        {substitution.sessionDate}
        {substitution.sessionTime !== null && (
          <span className="font-medium tabular-nums">
            {substitution.sessionTime}
          </span>
        )}
      </span>
      {/* The outcome, right-packed with the role beside it, so the column a
          reader scans for a name is the same column on every row. */}
      <span className="ms-auto flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
        <span className="text-muted-foreground">{tRole(substitution.role)}</span>
        <PersonChip
          id={substitution.requesterId}
          name={substitution.requesterName ?? t("unnamed")}
          size="compact"
        />
        {substituteId !== null ? (
          <>
            <ArrowRight
              className="h-3 w-3 shrink-0 text-muted-foreground"
              aria-label={t("substitutedBy")}
            />
            <PersonChip
              id={substituteId}
              name={substitution.substituteName ?? t("unnamed")}
              size="compact"
            />
          </>
        ) : (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Undo2 className="h-3 w-3 shrink-0" aria-hidden />
            {t("withdrawn")}
          </span>
        )}
      </span>
    </div>
  );
}
