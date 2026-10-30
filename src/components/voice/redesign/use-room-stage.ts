import { useState } from "react";
import { useTranslations } from "next-intl";
import type { VoiceZoneView } from "@/lib/voice/zone-composition";
import { useVoiceRoom } from "../VoiceRoomProvider";
import type { VoiceParticipant } from "../hooks/types";

export interface RoomStage {
  zoneLabel: (zone: VoiceZoneView) => string;
  /** The zone the reader is in, or `undefined` before the zones have composed. */
  currentZone: VoiceZoneView | undefined;
  /** The current zone's name, for a sentence: never blank. */
  currentZoneName: string;
  /** The people on the stage: everyone in the reader's zone, the reader included. */
  stageMembers: VoiceParticipant[];
  /** The person whose share is in view, or `null`. */
  sharer: VoiceParticipant | null;
  /** A gamer placed in a private zone: only a moderator can move them out. */
  isConfined: boolean;
  /** Whether the reader can move themselves into this zone now. */
  canEnter: (zone: VoiceZoneView) => boolean;
  enterZone: (zoneId: string) => void;
  leaving: boolean;
  leave: () => Promise<void>;
}

/**
 * Everything the two layouts share, derived once from the room's context.
 *
 * It lives above the layouts so that crossing the breakpoint, by rotating a
 * tablet or resizing a window, keeps a leave in flight.
 */
export function useRoomStage(onLeave: () => Promise<void>): RoomStage {
  const t = useTranslations();
  const {
    zones,
    participants,
    participantsByZone,
    currentZoneId,
    moveSelfToZone,
    isModerator,
    screenSharerSessionId,
  } = useVoiceRoom();

  // next-intl's keys are typed literals, so the virtual zones' fixed set is
  // resolved with literal calls rather than a dynamic `t(zone.name)`.
  const virtualLabels: Record<string, string> = {
    lobby: t("voice.zoneLobby"),
    "yty-harmony": t("yty.elements.harmony.name"),
    "yty-glow": t("yty.elements.glow.name"),
    "yty-valor": t("yty.elements.valor.name"),
    "yty-wit": t("yty.elements.wit.name"),
  };
  const zoneLabel = (zone: VoiceZoneView) =>
    zone.nameIsKey ? (virtualLabels[zone.id] ?? zone.id) : zone.name;
  const zoneName = (zone: VoiceZoneView | undefined) =>
    (zone && zoneLabel(zone)) || t("voice.unnamedZone");

  const currentZone = zones.find((z) => z.id === currentZoneId);
  const isConfined = !isModerator && !!currentZone?.isLocked;
  const canEnter = (zone: VoiceZoneView) =>
    zone.id !== currentZoneId &&
    !isConfined &&
    (!zone.isLocked || isModerator);

  const stageMembers = participantsByZone.get(currentZoneId) ?? [];

  // A share from a private zone the reader is outside of never reaches them:
  // the SFU does not send it, so there is nothing to give the stage to.
  const sharerIsOutOfView = zones.some(
    (zone) =>
      zone.isLocked &&
      zone.id !== currentZoneId &&
      participantsByZone
        .get(zone.id)
        ?.some((p) => p.sessionId === screenSharerSessionId),
  );
  const sharer = sharerIsOutOfView
    ? null
    : (participants.find((p) => p.sessionId === screenSharerSessionId) ?? null);

  const [leaving, setLeaving] = useState(false);
  const leave = async () => {
    setLeaving(true);
    try {
      await onLeave();
    } finally {
      setLeaving(false);
    }
  };

  return {
    zoneLabel,
    currentZone,
    currentZoneName: zoneName(currentZone),
    stageMembers,
    sharer,
    isConfined,
    canEnter,
    enterZone: moveSelfToZone,
    leaving,
    leave,
  };
}
