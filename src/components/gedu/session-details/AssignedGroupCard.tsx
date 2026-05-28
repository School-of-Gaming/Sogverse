"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Copy, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
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
 * The big "Your group" card at the top of the session-details page. Shows
 * everything the gedu needs at-a-glance for the gamers they teach: full
 * roster (Identicon + name + age/gender + click-to-copy parent email), the
 * assigned gedus as Identicon pills (so a gedu can see their co-teachers
 * on this group), the Join Voice button, and a "Copy all parent emails"
 * helper so they can paste a single comma-separated list into Gmail.
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold leading-tight sm:text-xl">
              {group.name || t("untitledGroup")}
            </h2>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              {t("yourGroupBadge")}
            </Badge>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {t("gamerCount", { count: group.gamer_count })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
              {t("educatorsLabel")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.gedus.map((g) => (
                <span
                  key={g.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-1 text-xs"
                >
                  <Avatar className="h-5 w-5">
                    <Identicon id={g.id} size={20} />
                  </Avatar>
                  <span className="leading-none">{g.first_name}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("gamersLabel")}
          </p>
          {roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("emptyRoster")}</p>
          ) : (
            <ul className="space-y-1.5">
              {roster.map((g) => (
                <GamerRosterRow key={g.gamer_id} gamer={g} />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CopyAllEmailsButton({ emails }: { emails: string[] }) {
  const t = useTranslations("gedu.sessionDetails");
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Insecure origin or denied — silent failure, gedu can still
      // copy individual emails from each row.
    }
  }, [emails]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className={cn("gap-1.5", copied && "border-success/40 text-success")}
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden />
      ) : (
        <Copy className="h-4 w-4" aria-hidden />
      )}
      {copied
        ? t("allEmailsCopied")
        : t("copyAllEmails", { count: emails.length })}
    </Button>
  );
}

/**
 * Strip nulls and de-duplicate so the same parent (e.g. two siblings in
 * the same group) only appears once in the pasted list.
 */
function deduplicateEmails(emails: (string | null)[]): string[] {
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
