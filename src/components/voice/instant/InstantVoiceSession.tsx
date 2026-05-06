"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { VoiceRoomProvider, useVoiceRoom } from "@/components/voice/VoiceRoomProvider";
import { SpatialVoiceRoom } from "@/components/voice/SpatialVoiceRoom";
import { InstantVoiceLobby } from "./InstantVoiceLobby";
import { CallEndedScreen } from "./CallEndedScreen";
import { RoomNotFoundScreen } from "./RoomNotFoundScreen";
import { EndCallModal } from "./EndCallModal";
import type { AppMessage } from "@/components/voice/hooks/types";

type SessionState =
  | { phase: "lobby" }
  | { phase: "in-call" }
  | { phase: "ended" }
  | { phase: "not-found" };

interface InstantVoiceSessionProps {
  /** Validated, uppercase 4-character code from the URL. */
  code: string;
}

/**
 * State-machine orchestrator for the public voice room page.
 *
 * Phases:
 *   - `lobby`     — Pre-join: cam/mic preview, name input. Default state.
 *   - `in-call`   — Connected to Daily; renders the spatial canvas.
 *   - `ended`     — Mod ended the call, OR the participant got disconnected
 *                   for a non-user reason (token expired, room deleted, etc.).
 *                   Dead-end screen with mission copy.
 *   - `not-found` — `/api/voice/instant/token` returned 404 because Daily
 *                   has no room with this code. Echoes the code back so the
 *                   user can spot typos.
 */
export function InstantVoiceSession({ code }: InstantVoiceSessionProps) {
  return (
    <VoiceRoomProvider>
      <InstantVoiceSessionInner code={code} />
    </VoiceRoomProvider>
  );
}

function InstantVoiceSessionInner({ code }: InstantVoiceSessionProps) {
  const t = useTranslations("voice");
  const tInstant = useTranslations("voice.instant");
  const { joined, join, leave, callObject } = useVoiceRoom();
  const [state, setState] = useState<SessionState>({ phase: "lobby" });
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [endModalOpen, setEndModalOpen] = useState(false);
  const [localRole, setLocalRole] = useState<"admin" | "gedu" | "guest" | null>(
    null,
  );

  // Tracks whether the local user initiated the leave themselves. A
  // non-user-initiated `left-meeting` (room deleted, token expired) means
  // we should land on the call-ended screen, not bounce back to the lobby.
  const userLeftRef = useRef(false);

  const handleJoin = useCallback(
    async (displayName: string) => {
      setJoinError(null);
      setJoining(true);
      try {
        const response = await fetch("/api/voice/instant/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, displayName }),
        });

        if (response.status === 404) {
          setState({ phase: "not-found" });
          setJoining(false);
          return;
        }

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setJoinError(
            typeof data.error === "string" ? data.error : tInstant("joinFailed"),
          );
          setJoining(false);
          return;
        }

        const { token, roomUrl, role } = await response.json();
        setLocalRole(role);
        await join(roomUrl, token);
        setState({ phase: "in-call" });
        setJoining(false);
      } catch (err) {
        setJoinError(err instanceof Error ? err.message : tInstant("joinFailed"));
        setJoining(false);
      }
    },
    [code, join, tInstant],
  );

  // Listen for the moderator's "ended for everyone" broadcast. Lands BEFORE
  // the Daily disconnect, so other clients can transition to the ended
  // screen with friendly copy instead of a generic "you were disconnected"
  // message. If a client misses the broadcast (race), the `left-meeting`
  // handler below catches the same case from the disconnect.
  useEffect(() => {
    if (!callObject) return;
    const onAppMessage = (event: { data: AppMessage }) => {
      if (event.data.type === "callEndedByMod") {
        userLeftRef.current = true; // suppress the "ended" path firing twice
        void leave().catch(() => {});
        setState({ phase: "ended" });
      }
    };
    callObject.on("app-message", onAppMessage);
    return () => {
      callObject.off("app-message", onAppMessage);
    };
  }, [callObject, leave]);

  // After we successfully joined, watch for the `joined` flag flipping
  // false again. That can only mean Daily disconnected us — token expired,
  // room deleted, network drop. If the user clicked Leave, `userLeftRef`
  // was already set true and we'll land elsewhere; otherwise show ended.
  useEffect(() => {
    if (state.phase !== "in-call") return;
    if (joined) return;
    // joined just went false while we were in-call
    if (userLeftRef.current) return;
    setState({ phase: "ended" });
  }, [joined, state.phase]);

  /**
   * Handler for the modal's "Leave call" button. Returns once the leave
   * has completed so the modal can clean up its loading state.
   */
  const handleLeave = useCallback(async () => {
    userLeftRef.current = true;
    await leave();
    setState({ phase: "ended" });
    setEndModalOpen(false);
  }, [leave]);

  /**
   * Handler for the modal's "End for everyone" button (mods only).
   * Broadcasts the friendly-end signal to peers, then asks the server to
   * delete the Daily room. Order matters: the broadcast must land before
   * the room is destroyed, otherwise peers see a generic disconnect.
   */
  const handleEndForEveryone = useCallback(async () => {
    userLeftRef.current = true;
    if (callObject) {
      const msg: AppMessage = { type: "callEndedByMod" };
      try {
        callObject.sendAppMessage(msg, "*");
      } catch {
        // Even if the broadcast fails, deleting the room still ends the
        // call — peers just won't see the friendly screen first.
      }
    }
    try {
      await fetch("/api/voice/instant/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
    } catch {
      // Best-effort — if the delete fails, the local leave below still
      // disconnects us and the room hangs around until its 8h exp.
    }
    await leave();
    setState({ phase: "ended" });
    setEndModalOpen(false);
  }, [callObject, code, leave]);

  // The leave button in SpatialVoiceRoom calls this. We open the modal
  // synchronously and resolve a promise when the modal closes (any
  // outcome) so SpatialVoiceRoom's internal "leaving" spinner reflects
  // the modal-open state.
  const openLeaveModalRef = useRef<{ resolve: () => void } | null>(null);
  const onLeaveButtonPressed = useCallback(() => {
    return new Promise<void>((resolve) => {
      openLeaveModalRef.current = { resolve };
      setEndModalOpen(true);
    });
  }, []);

  const handleModalOpenChange = useCallback((open: boolean) => {
    setEndModalOpen(open);
    if (!open) {
      openLeaveModalRef.current?.resolve();
      openLeaveModalRef.current = null;
    }
  }, []);

  if (state.phase === "not-found") {
    return <RoomNotFoundScreen code={code} />;
  }

  if (state.phase === "ended") {
    return <CallEndedScreen />;
  }

  if (state.phase === "lobby") {
    return (
      <InstantVoiceLobby
        onJoin={handleJoin}
        joining={joining}
        error={joinError}
      />
    );
  }

  // in-call
  if (!joined) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("connecting")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isMod = localRole === "admin" || localRole === "gedu";

  return (
    <div className="container mx-auto p-4 md:p-6">
      <SpatialVoiceRoom
        room={null}
        onLeave={onLeaveButtonPressed}
        leaveLabel={t("leave")}
      />
      <EndCallModal
        open={endModalOpen}
        onOpenChange={handleModalOpenChange}
        onLeave={handleLeave}
        onEndForEveryone={isMod ? handleEndForEveryone : undefined}
      />
    </div>
  );
}
