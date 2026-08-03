"use client";

import { useMemo } from "react";
import { Check, Copy, Star, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  PersonChipList,
  type PersonChipListPerson,
} from "@/components/ui/person-chip";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";
import type { GeduAssignedProductGroup } from "@/types";
import { GamerRosterRow } from "./GamerRosterRow";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";

interface AssignedGroupCardProps {
  group: GeduAssignedProductGroup;
  /** True when this product has a voice room (remote products only). */
  isRemote: boolean;
  voiceIsOpen: boolean;
  opensDate: string;
  opensTime: string;
}

/**
 * The big "Your group" card at the top of the session-details page. Shares
 * its header + action-row layout with PeerGroupCard — the two card variants
 * are visually the same shape; this one adds the "Your group" star badge,
 * the full roster (Identicon + name + age/gender + Minecraft + click-to-copy
 * parent email), and a "Copy all parent emails" helper so the gedu can paste
 * a single comma-separated list into Gmail.
 */
export function AssignedGroupCard({
  group,
  isRemote,
  voiceIsOpen,
  opensDate,
  opensTime,
}: AssignedGroupCardProps) {
  const t = useTranslations("gedu.sessionDetails");
  const voiceHref = isRemote ? ROUTES.voice.groupSession(group.id) : "#";
  const roster = useMemo(() => group.roster ?? [], [group.roster]);
  const allEmails = useMemo(
    () => deduplicateEmails(roster.map((r) => r.parent_email)),
    [roster],
  );

  return (
    <Card className="border-primary/40">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <GroupCardHeader
          name={group.name || t("untitledGroup")}
          gamerCount={group.gamer_count}
          showAssignedBadge
        />

        <div className="flex flex-wrap items-center justify-center gap-2">
          <JoinVoiceButton
            voiceIsOpen={voiceIsOpen}
            voiceHref={voiceHref}
            opensDate={opensDate}
            opensTime={opensTime}
          />
          {allEmails.length > 0 && (
            <CopyAllEmailsButton emails={allEmails} />
          )}
        </div>

        {group.gedus.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("gedusLabel")}
            </p>
            <PersonChipList people={geduChipPeople(group.gedus)} />
          </div>
        )}

        <div className="space-y-2">
          {roster.length === 0 ? (
            <>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("gamersLabel")}
              </p>
              <p className="text-sm text-muted-foreground">{t("emptyRoster")}</p>
            </>
          ) : (
            <>
              {/* One label, not a column header pair: a roster row is two
                  stacked lines (identity, then the parent email) at every
                  width, so there are no columns left to name. */}
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("gamersLabel")}
              </p>
              <ul className="space-y-1.5">
                {roster.map((g) => (
                  <GamerRosterRow key={g.gamer_id} gamer={g} />
                ))}
              </ul>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Top row used by both the assigned and peer group cards. Group name on the
 * left; the gamer-count chip is always on the right. The "Your group" badge
 * sits immediately to the left of the gamer-count so the assigned card is
 * recognizable at a glance without changing the rest of the row layout.
 */
export function GroupCardHeader({
  name,
  gamerCount,
  showAssignedBadge,
}: {
  name: string;
  gamerCount: number;
  showAssignedBadge?: boolean;
}) {
  const t = useTranslations("gedu.sessionDetails");
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="min-w-0 text-lg font-semibold leading-tight sm:text-xl">
        {name}
      </h2>
      <div className="flex shrink-0 items-center gap-2">
        {showAssignedBadge && (
          <Badge
            variant="secondary"
            className="gap-1 text-[10px] uppercase tracking-wide"
          >
            <Star className="h-3 w-3 fill-current" aria-hidden />
            {t("yourGroupBadge")}
          </Badge>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {t("gamerCount", { count: gamerCount })}
        </span>
      </div>
    </div>
  );
}

/**
 * "Copy all parent emails (7)" — one comma-separated list the gedu can paste
 * straight into Gmail. Exported so the draft redesign's roster panel offers the
 * same helper rather than growing a second copy of it.
 */
export function CopyAllEmailsButton({ emails }: { emails: string[] }) {
  const t = useTranslations("gedu.sessionDetails");
  const { copied, copy } = useCopyToClipboard();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void copy(emails.join(", "))}
      className={cn("gap-1.5", copied && "border-success/40 text-success")}
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden />
      ) : (
        <Copy className="h-4 w-4" aria-hidden />
      )}
      {copied
        ? t("allEmailsCopied")
        : t("copyAllParentEmails", { count: emails.length })}
    </Button>
  );
}

/**
 * A group's gedus as person-chip rows. The DB row spells the field
 * `first_name`; the shared chip primitive is not a gedu component and takes a
 * plain `name`, so the adaptation happens once here rather than in each of the
 * three surfaces that render these chips.
 */
export function geduChipPeople(
  gedus: GeduAssignedProductGroup["gedus"],
): PersonChipListPerson[] {
  return gedus.map((gedu) => ({ id: gedu.id, name: gedu.first_name }));
}

/**
 * Strip nulls and de-duplicate so the same parent (e.g. two siblings in
 * the same group) only appears once in the pasted list.
 */
export function deduplicateEmails(emails: (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of emails) {
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}
