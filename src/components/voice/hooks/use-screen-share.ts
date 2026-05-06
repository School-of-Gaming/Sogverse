import { useCallback, useState } from "react";
import type { DailyCall } from "@daily-co/daily-js";
import type { VoiceParticipant, VoiceRole } from "./types";

interface UseScreenShareParams {
  callObjectRef: React.MutableRefObject<DailyCall | null>;
  localRole: VoiceRole;
  /** The local user's session ID (from participants state, not a ref read) */
  localSessionId: string | null;
}

export function useScreenShare({ callObjectRef, localRole, localSessionId }: UseScreenShareParams) {
  const [screenSharerSessionId, setScreenSharerSessionId] = useState<string | null>(null);

  // Positive mod check so any non-mod role (gamer, guest, future ones) falls
  // through to "cannot screen share" without needing per-role updates.
  const canScreenShare = localRole === "admin" || localRole === "gedu";

  // Derived from state (screenSharerSessionId + localSessionId), not ref reads
  const isScreenSharing = screenSharerSessionId !== null && screenSharerSessionId === localSessionId;

  /** Auto-replace: if someone else is sharing, stop theirs first (requires owner) */
  const startScreenShare = useCallback(async () => {
    const co = callObjectRef.current;
    if (!co) return;

    if (screenSharerSessionId) {
      const localSid = co.participants().local.session_id;
      if (screenSharerSessionId !== localSid) {
        co.updateParticipant(screenSharerSessionId, { setScreenShare: false });
      }
    }

    try {
      await co.startScreenShare();
    } catch {
      // User cancelled the browser screen-share picker
    }
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
