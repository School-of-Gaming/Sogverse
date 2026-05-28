"use client";

import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { ROUTES } from "@/lib/constants";
import type { GeduAssignedProductGroup } from "@/types";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";

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
 * Compact card for one of the *other* groups on the same product. Shows
 * group name, active gamer count, and the assigned gedus as Identicon
 * pills — enough for the viewer to see who's teaching alongside them
 * without exposing the sister-group roster. Voice button shares the
 * same locked/unlocked state with the assigned-group card (every group
 * shares the product's schedule).
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
      <CardContent className="flex h-full flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-tight">
            {group.name || t("untitledGroup")}
          </h3>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {t("gamerCount", { count: group.gamer_count })}
          </span>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("educatorsLabel")}
          </p>
          {group.gedus.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noEducators")}</p>
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

        <div className="mt-auto flex justify-center pt-2">
          <JoinVoiceButton
            voiceIsOpen={voiceIsOpen}
            voiceHref={voiceHref}
            opensDate={opensDate}
            opensTime={opensTime}
          />
        </div>
      </CardContent>
    </Card>
  );
}
