import { useCallback, useState } from "react";
import type { DailyCall } from "@daily-co/daily-js";
import type { DailyParticipant } from "@daily-co/daily-js";
import type { UserRole } from "@/types";
import {
  type ZoneId,
  type SpatialPosition,
  getZoneAtPosition,
  getRandomPositionInZone,
  resolveOverlap,
  ejectFromBroadcastZone,
} from "@/lib/constants/spatial";
import type { AppMessage } from "./types";

interface UseSpatialPositionsParams {
  callObjectRef: React.MutableRefObject<DailyCall | null>;
  positionsRef: React.MutableRefObject<Map<string, SpatialPosition>>;
  onPositionChanged: () => void;
}

function mapRole(p: DailyParticipant): UserRole {
  const raw = p.user_name || "";
  return raw.split("|")[1] as UserRole;
}

export function useSpatialPositions({
  callObjectRef,
  positionsRef,
  onPositionChanged,
}: UseSpatialPositionsParams) {
  const [localZone, setLocalZone] = useState<ZoneId>("general");

  const broadcastPosition = useCallback((sessionId: string, position: SpatialPosition) => {
    const co = callObjectRef.current;
    if (!co) return;
    const msg: AppMessage = { type: "posUpdate", sessionId, position };
    co.sendAppMessage(msg, "*");
  }, [callObjectRef]);

  const moveLocal = useCallback((x: number, y: number) => {
    const co = callObjectRef.current;
    if (!co) return;

    const sessionId = co.participants().local.session_id;

    const zone = getZoneAtPosition(x, y);
    const position: SpatialPosition = { x, y, zone };

    positionsRef.current.set(sessionId, position);
    setLocalZone(zone);
    broadcastPosition(sessionId, position);
    onPositionChanged();
  }, [callObjectRef, positionsRef, broadcastPosition, onPositionChanged]);

  const moveOther = useCallback((targetSessionId: string, x: number, y: number) => {
    const co = callObjectRef.current;
    if (!co) return;

    const zone = getZoneAtPosition(x, y);
    const position: SpatialPosition = { x, y, zone };

    positionsRef.current.set(targetSessionId, position);
    onPositionChanged();

    const msg: AppMessage = { type: "moveUser", targetSessionId, position };
    co.sendAppMessage(msg, "*");
  }, [callObjectRef, positionsRef, onPositionChanged]);

  /** Place local avatar only — the join handshake (sending/replying with
   *  posUpdate per peer) is orchestrated by VoiceRoomProvider.
   *  Does NOT broadcast — existing participants send us
   *  their posUpdate on their participant-joined event (proving the SFU route
   *  works), and we reply with our own posUpdate then. This avoids the race
   *  where sendAppMessage("*") immediately after joined-meeting is unreliable
   *  under high latency because the SFU route may not be established yet. */
  const onJoined = useCallback((localSessionId: string) => {
    const randomPos = getRandomPositionInZone("general");
    const others = Array.from(positionsRef.current.values());
    const pos = resolveOverlap(randomPos.x, randomPos.y, others);
    const zone = getZoneAtPosition(pos.x, pos.y);
    const spatialPos: SpatialPosition = { ...pos, zone };
    positionsRef.current.set(localSessionId, spatialPos);
    setLocalZone(zone);
  }, [positionsRef]);

  const onParticipantLeft = useCallback((sessionId: string) => {
    positionsRef.current.delete(sessionId);
  }, [positionsRef]);

  /** Handle spatial app messages (posUpdate, moveUser). */
  const onAppMessage = useCallback((
    msg: AppMessage,
    fromId: string,
    co: DailyCall,
  ) => {
    switch (msg.type) {
      case "posUpdate": {
        // Reject spoofed updates — sender can only update their own position
        if (msg.sessionId !== fromId) break;
        const localSid = co.participants().local.session_id;
        if (msg.sessionId !== localSid) {
          positionsRef.current.set(msg.sessionId, msg.position);
          onPositionChanged();
        }
        break;
      }
      case "moveUser": {
        const sender = Object.values(co.participants()).find((p) => p.session_id === fromId);
        if (!sender?.owner) break;

        const localSid = co.participants().local.session_id;
        if (msg.targetSessionId === localSid) {
          const local = co.participants().local;
          const role = mapRole(local);

          let finalPos = msg.position;
          if (role === "gamer" && msg.position.zone === "broadcast") {
            const ejected = ejectFromBroadcastZone(msg.position.x, msg.position.y);
            const ejectedZone = getZoneAtPosition(ejected.x, ejected.y);
            finalPos = { ...ejected, zone: ejectedZone };
          }

          positionsRef.current.set(localSid, finalPos);
          setLocalZone(finalPos.zone);
          onPositionChanged();
          broadcastPosition(localSid, finalPos);
        } else {
          positionsRef.current.set(msg.targetSessionId, msg.position);
          onPositionChanged();
        }
        break;
      }
    }
  }, [positionsRef, onPositionChanged, broadcastPosition]);

  const reset = useCallback(() => {
    positionsRef.current.clear();
    setLocalZone("general");
  }, [positionsRef]);

  return {
    localZone,
    moveLocal,
    moveOther,
    onAppMessage,
    onJoined,
    onParticipantLeft,
    reset,
  };
}
