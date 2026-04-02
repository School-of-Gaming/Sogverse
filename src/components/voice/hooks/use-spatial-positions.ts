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
import type { AppMessage, LockState } from "./types";

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

  /** Place local avatar. Does NOT broadcast — existing participants send us
   *  a positionSync on their participant-joined event, and we reply with our
   *  position then. This avoids the race condition where broadcasting
   *  immediately after joined-meeting is unreliable under high latency
   *  (the SFU's app-message route may not be established yet). */
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

  /** Handle spatial app messages. Delegates lock data from positionSync to onLockStatesReceived. */
  const onAppMessage = useCallback((
    msg: AppMessage,
    fromId: string,
    co: DailyCall,
    onLockStatesReceived?: (locks: Record<string, LockState>) => void,
  ) => {
    switch (msg.type) {
      case "positionSync": {
        const localSid = co.participants().local.session_id;
        for (const [sid, pos] of Object.entries(msg.positions)) {
          if (sid !== localSid) {
            positionsRef.current.set(sid, pos);
          }
        }
        if (onLockStatesReceived) {
          onLockStatesReceived(msg.locks);
        }
        onPositionChanged();

        // Reply with our position so the sender can see us. This is the
        // reliable path: the sender's positionSync reached us (proving the
        // route works), so our reply will reach them.
        const localPos = positionsRef.current.get(localSid);
        if (localPos) {
          const reply: AppMessage = { type: "posUpdate", sessionId: localSid, position: localPos };
          co.sendAppMessage(reply, fromId);
        }
        break;
      }
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
