"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { VoiceRoomProvider, useVoiceRoom } from "@/components/voice/VoiceRoomProvider";
import { SpatialVoiceRoom } from "@/components/voice/SpatialVoiceRoom";
import { InstantVoiceLobby } from "./InstantVoiceLobby";
import { CallEndedScreen, type EndReason } from "./CallEndedScreen";
import { RoomNotFoundScreen } from "./RoomNotFoundScreen";
import { EndCallModal } from "./EndCallModal";
import type { AppMessage } from "@/components/voice/hooks/types";

type SessionState =
  | { phase: "checking" }
  | { phase: "lobby" }
  | { phase: "in-call" }
  | { phase: "ended"; reason: EndReason }
  | { phase: "not-found" };

interface InstantVoiceSessionProps {
  /** Validated, uppercase 4-character code from the URL. */
  code: string;
}

/**
 * State-machine orchestrator for the public voice room page.
 *
 * Phases:
 *   - `checking`  — On mount we ping `/api/voice/instant/exists` to make
 *                   sure the room is real before asking the user to grant
 *                   camera/mic permission and pick a name. Resolves to
 *                   `lobby` or `not-found`.
 *   - `lobby`     — Pre-join: cam/mic preview, name input.
 *   - `in-call`   — Connected to Daily; renders the spatial canvas.
 *   - `ended`     — Either the user clicked Leave (reason: "left") or
 *                   the call ended for everyone (reason: "ended" — mod
 *                   ended it, token expired, room deleted, network drop).
 *                   Different headlines for each.
 *   - `not-found` — Room doesn't exist. Echoes the code back so the user
 *                   can spot typos.
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
  const [state, setState] = useState<SessionState>({ phase: "checking" });
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [endModalOpen, setEndModalOpen] = useState(false);
  const [localRole, setLocalRole] = useState<"admin" | "gedu" | "guest" | null>(
    null,
  );

  // Tracks whether the local user initiated the leave themselves. A
  // non-user-initiated `left-meeting` (room deleted, token expired) means
  // we should land on the "call ended" screen, not the "you left" screen.
  const userLeftRef = useRef(false);

  // Pre-flight existence check. Don't burn the user's camera/mic permission
  // prompt or make them type a name if the room is gone.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const response = await fetch(
          `/api/voice/instant/exists?code=${encodeURIComponent(code)}`,
        );
        if (cancelled) return;
        if (response.status === 404) {
          setState({ phase: "not-found" });
          return;
        }
        // Any other non-2xx (rare — network, 500) — fall through to
        // lobby and let the join attempt surface the real error. The
        // alternative is an awkward "couldn't check" screen that's
        // worse than just trying.
        setState({ phase: "lobby" });
      } catch {
        if (cancelled) return;
        setState({ phase: "lobby" });
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [code]);

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
          // Room got deleted between the pre-flight check and the join.
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
        setState({ phase: "ended", reason: "ended" });
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
    if (userLeftRef.current) return;
    setState({ phase: "ended", reason: "ended" });
  }, [joined, state.phase]);

  /**
   * Handler for the modal's "Leave call" button. Returns once the leave
   * has completed so the modal can clean up its loading state.
   */
  const handleLeave = useCallback(async () => {
    userLeftRef.current = true;
    await leave();
    setState({ phase: "ended", reason: "left" });
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
    setState({ phase: "ended", reason: "ended" });
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

  if (state.phase === "checking") {
    return (
      <div className="container mx-auto max-w-xl p-4 md:p-6">
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {tInstant("checkingRoom")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.phase === "not-found") {
    return <RoomNotFoundScreen code={code} />;
  }

  if (state.phase === "ended") {
    return <CallEndedScreen reason={state.reason} />;
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
