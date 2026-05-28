"use client";

import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { ROUTES } from "@/lib/constants";
import type { GeduAssignedProductGroup } from "@/types";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";
import { GroupCardHeader } from "./AssignedGroupCard";

interface PeerGroupCardProps {
  group: GeduAssignedProductGroup;
  /** True when this product has a voice room (remote products only). */
  isRemote: boolean;
  /** Shared across every group on the product — same schedule. */
  voiceIsOpen: boolean;
  opensDate: string;
  opensTime: string;
}

/**
 * Card for one of the *other* groups on the same product. Same width and
 * shape as the assigned-group card so they read as a single series; missing
 * the "Your group" badge + the roster + the copy-emails helper. Voice
 * button sits in the same place as the assigned card so the action row
 * doesn't jump between cards. We deliberately don't expose the sister-group
 * roster — gedus see who's *teaching* alongside them (gedu pills), not the
 * kids in those groups.
 */
export function PeerGroupCard({
  group,
  isRemote,
  voiceIsOpen,
  opensDate,
  opensTime,
}: PeerGroupCardProps) {
  const t = useTranslations("gedu.sessionDetails");
  const voiceHref = isRemote ? ROUTES.voice.groupSession(group.id) : "#";

  return (
    <Card>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <GroupCardHeader
          name={group.name || t("untitledGroup")}
          gamerCount={group.gamer_count}
        />

        <div className="flex flex-wrap items-center gap-2">
          <JoinVoiceButton
            voiceIsOpen={voiceIsOpen}
            voiceHref={voiceHref}
            opensDate={opensDate}
            opensTime={opensTime}
          />
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("gedusLabel")}
          </p>
          {group.gedus.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noGedus")}</p>
          ) : (
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}
