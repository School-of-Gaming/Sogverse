"use client";

/**
 * Admin control to grant and revoke a gedu's qualifications, shown on the
 * gedu's /admin/users/[id] page directly after the certification card.
 *
 * One row per qualification, in the canonical order, each with its name, what
 * it qualifies the educator for, when and by whom it was granted, and a
 * checkbox. Ticking grants and unticking revokes, in one click and with no
 * confirmation — the same interaction the criminal record check uses, for the
 * same reason: it records a standing fact about a person, and taking it back
 * has to be as plain as setting it. Granting or revoking one warns about
 * nothing; what a missing qualification means for staffing is stated where a
 * gedu is placed (`services/gedu/CLAUDE.md`).
 *
 * Seeded with a server-fetched `initial` list so it paints complete on first
 * frame. `null` means that read failed: the rows still draw their words, and
 * the checkbox and the granted line arrive once the browser's own read
 * answers, because a box drawn unticked on the strength of a read that did not
 * land would state that the educator does not hold the qualification.
 *
 * **The checkbox is the row's trailing control and the granted line its last
 * line, and the order is load-bearing.** Both are what a failed server read
 * delivers late, so they sit where their arrival lands in the row's own slack
 * and moves nothing already painted. And ticking changes exactly one node — the
 * granted line's words — so the box an admin just clicked stays under the
 * cursor.
 */

import { useId, useState } from "react";
import { GraduationCap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  GEDU_QUALIFICATIONS,
  useGeduQualifications,
  useSetGeduQualification,
  type HeldGeduQualification,
} from "@/services/gedu";
import { personName } from "@/components/admin/person-name";
import { useQualificationNames } from "@/components/admin/qualification-names";
import { useTimezone } from "@/providers";
import type { GeduQualification } from "@/types";
import { formatDate } from "@/lib/utils";

interface GeduQualificationsCardProps {
  geduId: string;
  /** The gedu's qualifications as the page read them, or `null` where that read failed. */
  initial: HeldGeduQualification[] | null;
}

export function GeduQualificationsCard({ geduId, initial }: GeduQualificationsCardProps) {
  const t = useTranslations("admin.geduQualifications");
  const { data: held } = useGeduQualifications(geduId, {
    initialData: initial ?? undefined,
  });
  const setQualification = useSetGeduQualification();
  // Per qualification, because two rows can be in flight at once and one row's
  // write must not disable — or re-enable — the other's box.
  const [committing, setCommitting] = useState<ReadonlySet<GeduQualification>>(
    () => new Set(),
  );
  const [failed, setFailed] = useState<GeduQualification | null>(null);

  const names = useQualificationNames();

  /**
   * Grant or revoke one qualification. The flag is live before any render
   * after the click and cleared once the write settles either way: the
   * checkbox stays on the page through both outcomes, so there is no unmount to
   * hand it off to. `mutateAsync` settles only after the qualifications have
   * been refetched, so the box re-enables already showing the value it was set
   * to.
   */
  function toggle(qualification: GeduQualification, next: boolean) {
    setFailed(null);
    setCommitting((current) => new Set(current).add(qualification));
    void setQualification
      .mutateAsync({ geduId, qualification, held: next })
      .catch(() => setFailed(qualification))
      .finally(() =>
        setCommitting((current) => {
          const rest = new Set(current);
          rest.delete(qualification);
          return rest;
        }),
      );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-act" aria-hidden />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {GEDU_QUALIFICATIONS.map((qualification) => (
          <GeduQualificationRow
            key={qualification}
            name={names[qualification]}
            meaning={t(qualification)}
            held={
              held === undefined
                ? undefined
                : (held.find((row) => row.qualification === qualification) ?? null)
            }
            busy={committing.has(qualification)}
            failed={failed === qualification}
            errorMessage={
              setQualification.error instanceof Error
                ? setQualification.error.message
                : t("error")
            }
            onToggle={(next) => toggle(qualification, next)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function GeduQualificationRow({
  name,
  meaning,
  held,
  busy,
  failed,
  errorMessage,
  onToggle,
}: {
  name: string;
  meaning: string;
  /** The held row, `null` when not held, `undefined` while unanswered. */
  held: HeldGeduQualification | null | undefined;
  busy: boolean;
  failed: boolean;
  errorMessage: string;
  onToggle: (next: boolean) => void;
}) {
  const t = useTranslations("admin.geduQualifications");
  const locale = useLocale();
  const timeZone = useTimezone();
  const checkboxId = useId();

  function grantedLine(row: HeldGeduQualification | null): string {
    if (row === null) return t("notGranted");
    const date = formatDate(row.granted_at, locale, { dateStyle: "long", timeZone });
    // The granting admin beside the date, and the date alone where there is no
    // name to give — which is what a departed admin leaves behind
    // (`ON DELETE SET NULL`).
    const granter = personName(row.granter);
    return granter
      ? t("grantedOnBy", { date, name: granter })
      : t("grantedOn", { date });
  }

  return (
    <div className="space-y-2 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor={checkboxId} className="block cursor-pointer font-medium">
            {name}
          </label>
          <p className="text-sm text-muted-foreground">{meaning}</p>
          {held !== undefined && (
            <p className="text-sm text-muted-foreground">{grantedLine(held)}</p>
          )}
        </div>
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
