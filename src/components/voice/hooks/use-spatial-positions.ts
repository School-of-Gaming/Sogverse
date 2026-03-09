import { useCallback, useEffect, useRef, useState } from "react";
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
  return (raw.split("|")[1] as UserRole) || "gamer";
}

export function useSpatialPositions({
  callObjectRef,
  positionsRef,
  onPositionChanged,
}: UseSpatialPositionsParams) {
  const [positions, setPositions] = useState<Map<string, SpatialPosition>>(new Map());
  const [localZone, setLocalZone] = useState<ZoneId>("general");
  const posUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPositions = useCallback(() => {
    setPositions(new Map(positionsRef.current));
  }, [positionsRef]);

  const scheduleFlush = useCallback(() => {
    if (posUpdateTimerRef.current) return;
    posUpdateTimerRef.current = setTimeout(() => {
      posUpdateTimerRef.current = null;
      flushPositions();
    }, 50);
  }, [flushPositions]);

  const broadcastPosition = useCallback((sessionId: string, position: SpatialPosition) => {
    const co = callObjectRef.current;
    if (!co) return;
    const msg: AppMessage = { type: "posUpdate", sessionId, position };
    co.sendAppMessage(msg, "*");
  }, [callObjectRef]);

  const moveLocal = useCallback((x: number, y: number) => {
    const co = callObjectRef.current;
    if (!co) return;

    const sessionId = co.participants().local?.session_id;
    if (!sessionId) return;

    const zone = getZoneAtPosition(x, y);
    const position: SpatialPosition = { x, y, zone };

    positionsRef.current.set(sessionId, position);
    setLocalZone(zone);
    scheduleFlush();
    broadcastPosition(sessionId, position);
    onPositionChanged();
  }, [callObjectRef, positionsRef, scheduleFlush, broadcastPosition, onPositionChanged]);

  const moveOther = useCallback((targetSessionId: string, x: number, y: number) => {
    const co = callObjectRef.current;
    if (!co) return;

    const zone = getZoneAtPosition(x, y);
    const position: SpatialPosition = { x, y, zone };

    positionsRef.current.set(targetSessionId, position);
    scheduleFlush();
    onPositionChanged();

    const msg: AppMessage = { type: "moveUser", targetSessionId, position };
    co.sendAppMessage(msg, "*");
  }, [callObjectRef, positionsRef, scheduleFlush, onPositionChanged]);

  /** Place local avatar and request positions from existing participants */
  const onJoined = useCallback((localSessionId: string) => {
    const co = callObjectRef.current;
    if (!co) return;

    const randomPos = getRandomPositionInZone("general");
    const others = Array.from(positionsRef.current.values());
    const pos = resolveOverlap(randomPos.x, randomPos.y, others);
    const zone = getZoneAtPosition(pos.x, pos.y);
    const spatialPos: SpatialPosition = { ...pos, zone };
    positionsRef.current.set(localSessionId, spatialPos);
    setLocalZone(zone);
    flushPositions();
    broadcastPosition(localSessionId, spatialPos);

    const msg: AppMessage = { type: "requestPositions" };
    co.sendAppMessage(msg, "*");
  }, [callObjectRef, positionsRef, flushPositions, broadcastPosition]);

  const onParticipantLeft = useCallback((sessionId: string) => {
    positionsRef.current.delete(sessionId);
    scheduleFlush();
  }, [positionsRef, scheduleFlush]);

  /** Handle spatial app messages. Delegates lock data from positionSync to onLockStatesReceived. */
  const onAppMessage = useCallback((
    msg: AppMessage,
    fromId: string,
    co: DailyCall,
    onLockStatesReceived?: (locks: Record<string, LockState>) => void,
  ) => {
    switch (msg.type) {
      case "positionSync": {
        const localSid = co.participants().local?.session_id;
        for (const [sid, pos] of Object.entries(msg.positions)) {
          if (sid !== localSid) {
            positionsRef.current.set(sid, pos);
          }
        }
        if (msg.locks && onLockStatesReceived) {
          onLockStatesReceived(msg.locks);
        }
        scheduleFlush();
        onPositionChanged();
        break;
      }
      case "posUpdate": {
        const localSid = co.participants().local?.session_id;
        if (msg.sessionId !== localSid) {
          positionsRef.current.set(msg.sessionId, msg.position);
          scheduleFlush();
          onPositionChanged();
        }
        break;
      }
      case "moveUser": {
        const sender = Object.values(co.participants()).find((p) => p.session_id === fromId);
        if (!sender?.owner) break;

        const localSid = co.participants().local?.session_id;
        if (msg.targetSessionId === localSid) {
          const local = co.participants().local;
          const role = local ? mapRole(local) : "gamer";

          let finalPos = msg.position;
          if (role === "gamer" && msg.position.zone === "broadcast") {
            const ejected = ejectFromBroadcastZone(msg.position.x, msg.position.y);
            const ejectedZone = getZoneAtPosition(ejected.x, ejected.y);
            finalPos = { ...ejected, zone: ejectedZone };
          }

          positionsRef.current.set(localSid, finalPos);
          setLocalZone(finalPos.zone);
          scheduleFlush();
          onPositionChanged();
          broadcastPosition(localSid, finalPos);
        } else {
          positionsRef.current.set(msg.targetSessionId, msg.position);
          scheduleFlush();
          onPositionChanged();
        }
        break;
      }
    }
  }, [positionsRef, scheduleFlush, onPositionChanged, broadcastPosition]);

  const reset = useCallback(() => {
    positionsRef.current.clear();
    setPositions(new Map());
    setLocalZone("general");
    if (posUpdateTimerRef.current) {
      clearTimeout(posUpdateTimerRef.current);
      posUpdateTimerRef.current = null;
    }
  }, [positionsRef]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (posUpdateTimerRef.current) {
        clearTimeout(posUpdateTimerRef.current);
      }
    };
  }, []);

  return {
    positions,
    localZone,
    moveLocal,
    moveOther,
    onAppMessage,
    onJoined,
    onParticipantLeft,
    reset,
  };
}
