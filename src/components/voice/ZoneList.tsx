"use client";

import { useRef } from "react";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { useSpeakingGlow } from "./hooks/use-speaking-glow";
import { PrivacyScreen } from "./PrivacyScreen";
import type { VoiceZoneView } from "@/lib/voice/zone-composition";
import type { VoiceParticipant, LockedMember } from "./hooks/types";

/**
 * Mobile-first vertical stack of zone cards. The PR2 baseline UI for the
 * discrete-zone model — pure consumer of the provider (see CLAUDE.md). Tap a
 * non-locked zone to move into it. Live video tiles + drag-to-move + moderator
 * zone management arrive with the richer card UI; this proves out the
 * membership/audio seam.
 */
export function ZoneList() {
  const { zones, participantsByZone, lockedRoster, currentZoneId, moveSelfToZone } = useVoiceRoom();
  const t = useTranslations();

  // next-intl's message keys are typed literals, so resolve the fixed set of
  // virtual-zone labels with literal t() calls (a dynamic `t(zone.name)` won't
  // type-check). Custom zones carry their own literal name.
  const virtualLabels: Record<string, string> = {
    lobby: t("voice.zoneLobby"),
    "yty-harmony": t("yty.elements.harmony.name"),
    "yty-glow": t("yty.elements.glow.name"),
    "yty-valor": t("yty.elements.valor.name"),
    "yty-wit": t("yty.elements.wit.name"),
  };
  const labelFor = (zone: VoiceZoneView) =>
    zone.nameIsKey ? (virtualLabels[zone.id] ?? zone.id) : zone.name;

  return (
    <div className="space-y-3">
      {zones.map((zone) => (
        <ZoneCard
          key={zone.id}
          zone={zone}
          members={participantsByZone.get(zone.id) ?? []}
          lockedMembers={lockedRoster.get(zone.id) ?? []}
          isCurrent={zone.id === currentZoneId}
          onEnter={zone.isLocked ? undefined : () => moveSelfToZone(zone.id)}
          label={labelFor(zone)}
        />
      ))}
    </div>
  );
}

interface ZoneCardProps {
  zone: VoiceZoneView;
  members: VoiceParticipant[];
  /** Outsider roster for a locked zone (from the DB), rendered blurred. */
  lockedMembers: LockedMember[];
  isCurrent: boolean;
  label: string;
  /** undefined → not tappable (locked zone). */
  onEnter?: () => void;
}

function ZoneCard({ zone, members, lockedMembers, isCurrent, label, onEnter }: ZoneCardProps) {
  const t = useTranslations("voice");
  const Icon = zone.icon;
  const tappable = !!onEnter && !isCurrent;
  // Outsiders see a locked zone's roster from the DB (blurred); an insider
  // (the viewer is in this locked room) sees the real participants, no blur.
  const outsiderOfLocked = zone.isLocked && !isCurrent;
  const memberCount = outsiderOfLocked ? lockedMembers.length : members.length;

  return (
    <div
      role={tappable ? "button" : undefined}
      tabIndex={tappable ? 0 : undefined}
      onClick={tappable ? onEnter : undefined}
      onKeyDown={(e) => {
        if (!onEnter || isCurrent) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEnter();
        }
      }}
      aria-label={tappable ? t("joinZone", { zone: label }) : undefined}
      className={cn(
        "rounded-xl border p-3 transition-colors",
        isCurrent ? cn("ring-2", zone.color.ring) : "border-border",
        tappable && "cursor-pointer hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", zone.color.tile)}>
          <Icon className={cn("h-4 w-4", zone.color.glyph)} />
        </span>
        <span className="flex-1 truncate text-sm font-medium">{label}</span>
        {zone.isLocked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
        {isCurrent ? (
          <Badge variant="secondary" className="text-xs">{t("youAreHere")}</Badge>
        ) : (
          <Badge variant="outline" className="text-xs">
            {t("participantsCount", { count: memberCount })}
          </Badge>
        )}
      </div>

      {/* Locked zone (outsider view): blurred roster from the DB placements. The
          real privacy is the separate Daily room; the blur is the UI signal.
          An insider sees the real members below instead. */}
      {outsiderOfLocked ? (
        lockedMembers.length > 0 && (
          <div className="relative mt-3">
            <div className="flex flex-wrap gap-3">
              {lockedMembers.map((m) => (
                <LockedMemberTile key={m.gamerId} gamerId={m.gamerId} />
              ))}
            </div>
            <PrivacyScreen />
          </div>
        )
      ) : (
        members.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {members.map((p) => (
              <ZoneMemberTile key={p.sessionId} participant={p} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function LockedMemberTile({ gamerId }: { gamerId: string }) {
  return (
    <div className="flex w-14 flex-col items-center gap-1">
      <div className="rounded-md border-2 border-border">
        <Avatar className="h-12 w-12 rounded-md">
          <Identicon id={gamerId} size={48} />
        </Avatar>
      </div>
    </div>
  );
}

function ZoneMemberTile({ participant: p }: { participant: VoiceParticipant }) {
  const t = useTranslations("voice");
  const ref = useRef<HTMLDivElement>(null);
  useSpeakingGlow(ref, p.sessionId, p.audioOn);

  return (
    <div className="flex w-14 flex-col items-center gap-1">
      <div
        ref={ref}
        className={cn(
          "rounded-md border-2 border-border transition-shadow",
          p.isLocal && "ring-1 ring-primary/30",
        )}
      >
        <Avatar className="h-12 w-12 rounded-md">
          <Identicon id={p.userId} size={48} />
        </Avatar>
      </div>
      <span className="w-full truncate text-center text-[10px] leading-tight">
        {p.userName}
        {p.isLocal && <span className="text-muted-foreground"> {t("you")}</span>}
      </span>
    </div>
  );
}
