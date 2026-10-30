import { useState } from "react";
import { useTranslations } from "next-intl";
import type { VoiceZoneView } from "@/lib/voice/zone-composition";
import { useVoiceRoom } from "../VoiceRoomProvider";
import type { VoiceParticipant } from "../hooks/types";

/** Who a gamer looks to: a trainee's role is `gedu`, and to a gamer a trainee is a Gedu. */
function isGedu(p: VoiceParticipant) {
  return p.role === "gedu" || p.role === "admin";
}

/** Gedus first, and nobody otherwise reordered. */
export function geduFirst(people: VoiceParticipant[]) {
  return [...people.filter(isGedu), ...people.filter((p) => !isGedu(p))];
}

/**
 * Which shares the reader has, in the order they started, and the one they have
 * up big. The room only says who is sharing now, so the order has to be kept here.
 */
interface ShareView {
  order: string[];
  bigId: string | null;
}

/**
 * The view after the room's shares changed, or the same object when nothing did.
 * The big share is cleared as soon as it stops, so someone sharing again later
 * joins the end of the line rather than taking the stage back.
 */
function reconcileShares(view: ShareView, liveIds: string[]): ShareView {
  const order = [
    ...view.order.filter((id) => liveIds.includes(id)),
    ...liveIds.filter((id) => !view.order.includes(id)),
  ];
  const bigId = view.bigId !== null && order.includes(view.bigId) ? view.bigId : (order[0] ?? null);
  const unchanged =
    bigId === view.bigId &&
    order.length === view.order.length &&
    order.every((id, index) => id === view.order[index]);
  return unchanged ? view : { order, bigId };
}

export interface RoomStage {
  zoneLabel: (zone: VoiceZoneView) => string;
  /** The zone the reader is in, or `undefined` before the zones have composed. */
  currentZone: VoiceZoneView | undefined;
  /** The current zone's name: never blank. */
  currentZoneName: string;
  /**
   * The people on the stage: everyone in the reader's zone, the reader included,
   * with the Gedus first and everyone otherwise in the room's order.
   */
  stageMembers: VoiceParticipant[];
  /** The share on the stage, or `null` when nobody in view is sharing. */
  bigShare: VoiceParticipant | null;
  /** Every other share in view, earliest first. */
  otherShares: VoiceParticipant[];
  /** Puts this person's share on the stage. Nothing else changes which one is there. */
  showShare: (sessionId: string) => void;
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

  const stageMembers = geduFirst(participantsByZone.get(currentZoneId) ?? []);

  // A share from a private zone the reader is outside of never reaches them:
  // the SFU does not send it, so there is nothing to give the stage to.
  const outOfView = new Set(
    zones
      .filter((zone) => zone.isLocked && zone.id !== currentZoneId)
      .flatMap((zone) => participantsByZone.get(zone.id) ?? [])
      .map((p) => p.sessionId),
  );
  const shares = participants.filter((p) => p.screenShareOn && !outOfView.has(p.sessionId));

  const [storedShareView, setShareView] = useState<ShareView>({ order: [], bigId: null });
  const shareView = reconcileShares(
    storedShareView,
    shares.map((p) => p.sessionId),
  );
  if (shareView !== storedShareView) setShareView(shareView);
  const shareOf = (sessionId: string) => shares.find((p) => p.sessionId === sessionId);
  const bigShare = (shareView.bigId !== null && shareOf(shareView.bigId)) || null;
  const otherShares = shareView.order
    .filter((id) => id !== shareView.bigId)
    .flatMap((id) => shareOf(id) ?? []);
  const showShare = (sessionId: string) =>
    setShareView((view) => ({ ...view, bigId: sessionId }));

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
    bigShare,
    otherShares,
    showShare,
    isConfined,
    canEnter,
    enterZone: moveSelfToZone,
    leaving,
    leave,
  };
}
