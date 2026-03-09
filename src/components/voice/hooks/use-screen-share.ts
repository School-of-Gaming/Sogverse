import { useCallback, useState } from "react";
import type { DailyCall } from "@daily-co/daily-js";
import type { UserRole } from "@/types";
import type { VoiceParticipant } from "./types";

interface UseScreenShareParams {
  callObjectRef: React.MutableRefObject<DailyCall | null>;
  localRole: UserRole;
  /** The local user's session ID (from participants state, not a ref read) */
  localSessionId: string | null;
}

export function useScreenShare({ callObjectRef, localRole, localSessionId }: UseScreenShareParams) {
  const [screenSharerSessionId, setScreenSharerSessionId] = useState<string | null>(null);

  const canScreenShare = localRole !== "gamer";

  // Derived from state (screenSharerSessionId + localSessionId), not ref reads
  const isScreenSharing = screenSharerSessionId !== null && screenSharerSessionId === localSessionId;

  /** Auto-replace: if someone else is sharing, stop theirs first (requires owner) */
  const startScreenShare = useCallback(async () => {
    const co = callObjectRef.current;
    if (!co) return;

    if (screenSharerSessionId) {
      const localSid = co.participants().local?.session_id;
      if (screenSharerSessionId !== localSid) {
        co.updateParticipant(screenSharerSessionId, { setScreenShare: false });
      }
    }

    await co.startScreenShare();
  }, [callObjectRef, screenSharerSessionId]);

  const stopScreenShare = useCallback(() => {
    callObjectRef.current?.stopScreenShare();
  }, [callObjectRef]);

  /** Scan participants for the active screen sharer */
  const detectScreenSharer = useCallback((participants: VoiceParticipant[]) => {
    const sharer = participants.find((p) => p.screenShareOn);
    setScreenSharerSessionId(sharer?.sessionId ?? null);
  }, []);

  const reset = useCallback(() => {
    setScreenSharerSessionId(null);
  }, []);

  return {
    screenSharerSessionId,
    canScreenShare,
    isScreenSharing,
    startScreenShare,
    stopScreenShare,
    detectScreenSharer,
    reset,
  };
}
