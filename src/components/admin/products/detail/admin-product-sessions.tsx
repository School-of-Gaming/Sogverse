"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Mail, Minus, NotebookPen, UserRound, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ATTENDANCE_TONE } from "@/components/session-feed";
import {
  SessionFeed,
  type SessionEntryDraft,
  type SessionReportSendResult,
} from "@/components/gedu/session-feed";
import { cn } from "@/lib/utils";
import {
  attendanceLedger,
  tallySessions,
  type AdminProductGroupDetail,
} from "./admin-product-detail-data";

/**
 * **What actually happened**, per group — the section this whole redesign is for.
 *
 * An admin has never been able to read a session report, a gedu note or an
 * attendance sheet anywhere in the admin panel. The workaround was making a
 * second gedu account and assigning it to the group, which is both a fiction in
 * the data and a permanent one: nobody ever unassigns it. So the group's feed is
 * simply on the product's page now.
 *
 * **It is the gedu's own feed component, not a copy of it**, and that is the
 * whole design decision here. A parallel admin renderer would be a third
 * skin over the same entries whose only job would be to look like the second
 * one, and it would rot the way every parallel renderer rots — the day somebody
 * changes what a card says about an unsent report, one of the two surfaces would
 * go on saying the old thing. There is one workspace feed; the admin reads it.
 * (The *family* feed stays separate for a reason that has nothing to do with
 * effort: a family may not see a gedu note, and the split is what makes that a
 * compile-time fact.)
 *
 * What is admin-only is the strip above it: the term's ledger and the register
 * totals, which are the two questions an admin asks that a gedu never does —
 * did the write-ups get done, and does the attendance match what we invoiced.
 *
 * **The group selector is a segmented control, not a tab strip**, and it is
 * absent on a product with one group. A gedu sees one group and needs no
 * chooser; an admin sees all of them and needs to pick, but they are the same
 * kind of thing viewed one at a time — which is a selector, not navigation.
 */
export function AdminProductSessions({
  groups,
  now,
  sourceTimeZone,
  editingEntryId,
  onEditEntry,
  onSaveEntry,
  onSendReport,
}: {
  groups: readonly AdminProductGroupDetail[];
  /** The instant the entries were built from — the feed's clock, not a live one. */
  now: Date;
  /** The zone the schedule was authored in; the feed renders in the viewer's. */
  sourceTimeZone: string;
  editingEntryId: string | null;
  onEditEntry: (entryId: string | null) => void;
  onSaveEntry: (entryId: string, draft: SessionEntryDraft) => void | Promise<void>;
  onSendReport: (entryId: string) => Promise<SessionReportSendResult>;
}) {
  const t = useTranslations("admin.products.detail");
  const [selectedGroupId, setSelectedGroupId] = useState(
    groups[0]?.groupId ?? null,
  );

  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t("sessions.noGroups")}
        </CardContent>
      </Card>
    );
  }

  const selected =
    groups.find((group) => group.groupId === selectedGroupId) ?? groups[0];

  return (
    <div className="space-y-4">
      {groups.length > 1 && (
        <div
          role="tablist"
          aria-label={t("sessions.groupSelectorAria")}
          className="inline-flex flex-wrap gap-1 rounded-full border border-border p-1"
        >
          {groups.map((group) => {
            const active = group.groupId === selected.groupId;
            return (
              <button
                key={group.groupId}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedGroupId(group.groupId)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {group.name}
              </button>
            );
          })}
        </div>
      )}

      <SessionLedger group={selected} />

      <SessionFeed
        // Keyed by group so switching rebuilds the feed's own scroll and reveal
        // state rather than carrying one group's revealed history into another's.
        key={selected.groupId}
        entries={selected.entries}
        now={now}
        roster={selected.roster}
        sourceTimeZone={sourceTimeZone}
        editingEntryId={editingEntryId}
        onEditEntry={onEditEntry}
        onSaveEntry={onSaveEntry}
        onSendReport={onSendReport}
      />
    </div>
  );
}

/**
 * The term at a glance: three counts, then the register totalled per child.
 *
 * The three counts are deliberately a *descending* sequence — ran, written up,
 * emailed — because each is a subset of the one before it and the gaps between
 * them are the whole point. Two numbers that match say the paperwork is done;
 * "14 · 11 · 9" says exactly how far behind it is without anybody scrolling a
 * term of cards to count amber dots.
 *
 * The per-child line carries three counts for the same reason the feed does:
 * unmarked is not absent. An invoice built on "absent" that quietly included
 * every session nobody got round to marking would be wrong in the direction that
 * costs a municipality money.
 */
function SessionLedger({ group }: { group: AdminProductGroupDetail }) {
  const t = useTranslations("admin.products.detail");
  const tally = tallySessions(group.entries);
  const ledger = attendanceLedger(group.entries, group.roster);

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <LedgerStat
            icon={UserRound}
            label={t("sessions.ledger.run")}
            value={tally.run}
          />
          <LedgerStat
            icon={NotebookPen}
            label={t("sessions.ledger.writtenUp")}
            value={tally.writtenUp}
            // Amber only where something is genuinely outstanding. A term where
            // every session is written up is the ordinary state and must not be
            // wearing a warning colour to say so.
            tone={tally.writtenUp < tally.run ? "warning" : "plain"}
          />
          <LedgerStat
            icon={Mail}
            label={t("sessions.ledger.emailed")}
            value={tally.emailed}
            tone={tally.emailed < tally.writtenUp ? "warning" : "plain"}
          />
        </div>

        {ledger.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3 text-xs">
            {ledger.map((row) => (
              <li key={row.gamerId} className="flex items-center gap-1.5">
                <span className="font-medium">{row.firstName}</span>
                <span className="flex items-center gap-1 tabular-nums">
                  <span
                    className={cn("inline-flex items-center gap-0.5", ATTENDANCE_TONE.present.text)}
                    title={t("sessions.ledger.present")}
                  >
                    <Check aria-hidden className="h-3 w-3" />
                    {row.present}
                  </span>
                  <span
                    className={cn("inline-flex items-center gap-0.5", ATTENDANCE_TONE.absent.text)}
                    title={t("sessions.ledger.absent")}
                  >
                    <X aria-hidden className="h-3 w-3" />
                    {row.absent}
                  </span>
                  <span
                    className={cn("inline-flex items-center gap-0.5", ATTENDANCE_TONE.unmarked.text)}
                    title={t("sessions.ledger.unmarked")}
                  >
                    <Minus aria-hidden className="h-3 w-3" />
                    {row.unmarked}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function LedgerStat({
  icon: Icon,
  label,
  value,
  tone = "plain",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "plain" | "warning";
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "text-lg font-semibold tabular-nums",
            tone === "warning" && "text-warning",
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
