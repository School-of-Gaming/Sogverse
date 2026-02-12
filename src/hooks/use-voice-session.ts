"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceRoom } from "@/components/voice/VoiceRoomProvider";
import { useMyVoiceRoom, useOpenRoom, useCloseRoom, useVoiceToken, useOpenVoiceRooms } from "@/services/voice";
import { useVoiceRoomRealtime } from "@/hooks/use-voice-room-realtime";
import type { OpenVoiceRoom, VoiceRoom } from "@/types";

interface UseVoiceSessionOptions {
  /** Whether the user can create/own their own room (admin/gedu) */
  canCreate: boolean;
  /** Whether to auto-reconnect to own open room on mount */
  autoReconnect?: boolean;
}

interface UseVoiceSessionReturn {
  /** The user's own room (if canCreate) */
  myRoom: VoiceRoom | null | undefined;
  /** All open rooms */
  openRooms: OpenVoiceRoom[];
  /** Open rooms excluding the user's own */
  otherRooms: OpenVoiceRoom[];
  /** Whether the initial room data is loading */
  isLoading: boolean;
  /** Whether the user is in a call */
  joined: boolean;
  /** Whether the user is currently connecting */
  joining: boolean;
  /** Whether we're reconnecting to an existing session */
  reconnecting: boolean;
  /** The room ID that the user has joined */
  joinedRoomId: string | null;
  /** Whether the joined room is the user's own room */
  isOwnRoom: boolean;
  /** Session ended message (for gamers) */
  sessionEndedMessage: string | null;
  /** Error message */
  error: string | null;
  /** Whether an action is in progress */
  actionPending: boolean;
  /** Start own session (create room + join) */
  startSession: () => Promise<void>;
  /** Join another room */
  joinRoom: (room: OpenVoiceRoom) => Promise<void>;
  /** Leave the call without closing the room */
  leaveSession: () => Promise<void>;
  /** Leave and close the room */
  endSession: () => Promise<void>;
}

export function useVoiceSession({
  canCreate,
  autoReconnect = true,
}: UseVoiceSessionOptions): UseVoiceSessionReturn {
  const { data: myRoom, isLoading: myRoomLoading } = useMyVoiceRoom();
  const { data: openRoomsList } = useOpenVoiceRooms();
  const openRoomMutation = useOpenRoom();
  const closeRoomMutation = useCloseRoom();
  const getToken = useVoiceToken();
  const { joined, joining, join, leave } = useVoiceRoom();

  const [actionPending, setActionPending] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [joinedRoomId, setJoinedRoomId] = useState<string | null>(null);
  const [sessionEndedMessage, setSessionEndedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const joinedRoomNameRef = useRef<string | null>(null);
  const hasCheckedForReconnect = useRef(false);

  useVoiceRoomRealtime();

  const isLoading = canCreate ? myRoomLoading : (openRoomsList === undefined);
  const openRooms = openRoomsList || [];

  const otherRooms = canCreate
    ? openRooms.filter((r) => r.creator_id !== myRoom?.creator_id)
    : openRooms;

  const isOwnRoom = canCreate && myRoom?.id === joinedRoomId;

  /** Start own session (create room + join) */
  const startSession = useCallback(async () => {
    setError(null);
    setActionPending(true);
    try {
      const voiceRoom = await openRoomMutation.mutateAsync(undefined);
      const { token, roomUrl } = await getToken.mutateAsync(voiceRoom.id);
      await join(roomUrl, token);
      setJoinedRoomId(voiceRoom.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
    } finally {
      setActionPending(false);
    }
  }, [openRoomMutation, getToken, join]);

  /** Join another creator's room */
  const joinRoom = useCallback(async (targetRoom: OpenVoiceRoom) => {
    setError(null);
    setSessionEndedMessage(null);
    setActionPending(true);
    try {
      const { token, roomUrl } = await getToken.mutateAsync(targetRoom.id);
      await join(roomUrl, token);
      setJoinedRoomId(targetRoom.id);
      joinedRoomNameRef.current = targetRoom.name;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join room");
    } finally {
      setActionPending(false);
    }
  }, [getToken, join]);

  /** Leave the call without closing the room */
  const leaveSession = useCallback(async () => {
    setJoinedRoomId(null);
    joinedRoomNameRef.current = null;
  }, []);

  /** Leave and close the room */
  const endSession = useCallback(async () => {
    setError(null);
    try {
      await closeRoomMutation.mutateAsync(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end session");
    }
    setJoinedRoomId(null);
    joinedRoomNameRef.current = null;
  }, [closeRoomMutation]);

  // Auto-reconnect to own open room on mount
  useEffect(() => {
    if (!canCreate || !autoReconnect) return;
    if (hasCheckedForReconnect.current || myRoomLoading) return;
    hasCheckedForReconnect.current = true;

    if (myRoom?.status === "open" && !joined) {
      setReconnecting(true);
      startSession().finally(() => setReconnecting(false));
    }
  }, [canCreate, autoReconnect, myRoom, myRoomLoading, joined, startSession]);

  // Auto-leave when the joined room gets closed
  useEffect(() => {
    if (!joined || !joinedRoomId || !openRoomsList) return;

    const roomStillOpen = openRoomsList.some((r) => r.id === joinedRoomId);
    if (!roomStillOpen) {
      const roomName = joinedRoomNameRef.current;
      leave();
      joinedRoomNameRef.current = null;
      Promise.resolve().then(() => {
        setSessionEndedMessage(`${roomName ?? "The session"} has ended.`);
        setJoinedRoomId(null);
      });
    }
  }, [joined, joinedRoomId, openRoomsList, leave]);

  return {
    myRoom,
    openRooms,
    otherRooms,
    isLoading,
    joined,
    joining,
    reconnecting,
    joinedRoomId,
    isOwnRoom,
    sessionEndedMessage,
    error,
    actionPending,
    startSession,
    joinRoom,
    leaveSession,
    endSession,
  };
}
