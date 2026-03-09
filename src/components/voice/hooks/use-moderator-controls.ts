import { useCallback, useRef, useState } from "react";
import type { DailyCall } from "@daily-co/daily-js";
import type { AppMessage, LockState } from "./types";

interface UseModeratorControlsParams {
  callObjectRef: React.MutableRefObject<DailyCall | null>;
  setMicOn: React.Dispatch<React.SetStateAction<boolean>>;
  setCameraOn: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useModeratorControls({
  callObjectRef,
  setMicOn,
  setCameraOn,
}: UseModeratorControlsParams) {
  const lockStateRef = useRef<Map<string, LockState>>(new Map());
  const [lockStates, setLockStates] = useState<Map<string, LockState>>(new Map());
  const [localLocks, setLocalLocks] = useState<LockState>({ audio: false, video: false });
  // Ref mirror for lock-aware toggles (avoids stale closures)
  const localLocksRef = useRef<LockState>({ audio: false, video: false });

  const flushLockStates = useCallback(() => {
    setLockStates(new Map(lockStateRef.current));
  }, []);

  /** Force-mute a participant's audio or video (one-time, they can re-enable) */
  const muteParticipant = useCallback((sessionId: string, track: "audio" | "video") => {
    const co = callObjectRef.current;
    if (!co) return;

    if (track === "audio") {
      co.updateParticipant(sessionId, { setAudio: false });
    } else {
      co.updateParticipant(sessionId, { setVideo: false });
    }

    const msg: AppMessage = { type: "moderatorMute", targetSessionId: sessionId, track };
    co.sendAppMessage(msg, "*");
  }, [callObjectRef]);

  /** Lock/unlock a participant's ability to send audio or video (persistent via canSend) */
  const lockParticipant = useCallback((sessionId: string, track: "audio" | "video", locked: boolean) => {
    const co = callObjectRef.current;
    if (!co) return;

    const current = lockStateRef.current.get(sessionId) ?? { audio: false, video: false };
    const updated = { ...current, [track]: locked };
    lockStateRef.current.set(sessionId, updated);
    flushLockStates();

    // Build the canSend array based on what's NOT locked
    const canSend: string[] = [];
    if (!updated.audio) canSend.push("audio");
    if (!updated.video) canSend.push("video");
    canSend.push("screenAudio", "screenVideo");

    if (locked) {
      const forceOff = track === "audio" ? { setAudio: false } : { setVideo: false };
      co.updateParticipant(sessionId, {
        ...forceOff,
        updatePermissions: { canSend: canSend as ("audio" | "video" | "screenAudio" | "screenVideo")[] },
      });
    } else {
      co.updateParticipant(sessionId, {
        updatePermissions: { canSend: canSend as ("audio" | "video" | "screenAudio" | "screenVideo")[] },
      });
    }

    const msg: AppMessage = { type: "moderatorLock", targetSessionId: sessionId, track, locked };
    co.sendAppMessage(msg, "*");
  }, [callObjectRef, flushLockStates]);

  /** Handle moderator app messages */
  const onAppMessage = useCallback((msg: AppMessage, fromId: string, co: DailyCall) => {
    switch (msg.type) {
      case "moderatorMute": {
        const sender = Object.values(co.participants()).find((p) => p.session_id === fromId);
        if (!sender?.owner) break;
        // UI feedback only — track change happens via updateParticipant,
        // which triggers Daily's participant-updated event
        break;
      }
      case "moderatorLock": {
        const sender = Object.values(co.participants()).find((p) => p.session_id === fromId);
        if (!sender?.owner) break;

        const current = lockStateRef.current.get(msg.targetSessionId) ?? { audio: false, video: false };
        const updated = { ...current, [msg.track]: msg.locked };
        lockStateRef.current.set(msg.targetSessionId, updated);
        flushLockStates();

        // If we are the target and being locked, force our track off
        const localSid = co.participants().local?.session_id;
        if (msg.targetSessionId === localSid) {
          localLocksRef.current = updated;
          setLocalLocks(updated);
          if (msg.locked) {
            if (msg.track === "audio") {
              co.setLocalAudio(false);
              setMicOn(false);
            } else {
              co.setLocalVideo(false);
              setCameraOn(false);
            }
          }
        }
        break;
      }
    }
  }, [flushLockStates, setMicOn, setCameraOn]);

  /** Merge lock states received from positionSync (late-joiner sync) */
  const onLockStatesReceived = useCallback((locks: Record<string, LockState>) => {
    const co = callObjectRef.current;
    const localSid = co?.participants().local?.session_id;

    for (const [sid, lock] of Object.entries(locks)) {
      lockStateRef.current.set(sid, lock);
      if (sid === localSid) {
        localLocksRef.current = lock;
        setLocalLocks(lock);
      }
    }
    flushLockStates();
  }, [callObjectRef, flushLockStates]);

  const onParticipantLeft = useCallback((sessionId: string) => {
    lockStateRef.current.delete(sessionId);
    flushLockStates();
  }, [flushLockStates]);

  const reset = useCallback(() => {
    lockStateRef.current.clear();
    setLockStates(new Map());
    localLocksRef.current = { audio: false, video: false };
    setLocalLocks({ audio: false, video: false });
  }, []);

  return {
    localLocks,
    localLocksRef,
    lockStates,
    muteParticipant,
    lockParticipant,
    onAppMessage,
    onLockStatesReceived,
    onParticipantLeft,
    reset,
  };
}
