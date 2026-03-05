"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceRoom } from "@/components/voice/VoiceRoomProvider";
import { useAvailableVoiceRooms, useVoiceToken } from "@/services/voice";
import type { AvailableVoiceRoomWithWindow } from "@/services/voice";
import { useVoiceRoomRealtime } from "@/hooks/use-voice-room-realtime";
import { computeSessionWindow } from "@/lib/voice-schedule";

interface UseVoiceSessionReturn {
  rooms: AvailableVoiceRoomWithWindow[];
  alwaysOpenRooms: AvailableVoiceRoomWithWindow[];
  openGroupRooms: AvailableVoiceRoomWithWindow[];
  upcomingRooms: AvailableVoiceRoomWithWindow[];
  isLoading: boolean;
  joined: boolean;
  joining: boolean;
  joiningRoomId: string | null;
  joinedRoomId: string | null;
  sessionEndedMessage: string | null;
  error: string | null;
  actionPending: boolean;
  joinRoom: (room: AvailableVoiceRoomWithWindow) => Promise<void>;
  leaveSession: () => Promise<void>;
}

export function useVoiceSession(): UseVoiceSessionReturn {
  const { data: roomsList, isLoading: roomsLoading } = useAvailableVoiceRooms();
  const getToken = useVoiceToken();
  const { joined, joining, join, leave } = useVoiceRoom();

  const [actionPending, setActionPending] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [joinedRoomId, setJoinedRoomId] = useState<string | null>(null);
  const [sessionEndedMessage, setSessionEndedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const joinedRoomNameRef = useRef<string | null>(null);

  useVoiceRoomRealtime();

  const rooms = roomsList || [];

  // Sort: always-open rooms first, then group rooms by soonest nextSessionStart
  const alwaysOpenRooms = rooms.filter((r) => r.room_type !== "group");
  const groupRooms = rooms.filter((r) => r.room_type === "group");
  const openGroupRooms = groupRooms
    .filter((r) => r.isOpen)
    .sort((a, b) => (a.nextSessionStart?.getTime() ?? 0) - (b.nextSessionStart?.getTime() ?? 0));
  const upcomingRooms = groupRooms
    .filter((r) => !r.isOpen)
    .sort((a, b) => (a.nextSessionStart?.getTime() ?? 0) - (b.nextSessionStart?.getTime() ?? 0));

  /** Join a room */
  const joinRoom = useCallback(async (targetRoom: AvailableVoiceRoomWithWindow) => {
    setError(null);
    setSessionEndedMessage(null);
    setActionPending(true);
    setJoiningRoomId(targetRoom.id);
    try {
      const { token, roomUrl } = await getToken.mutateAsync(targetRoom.id);
      await join(roomUrl, token);
      setJoinedRoomId(targetRoom.id);
      joinedRoomNameRef.current = targetRoom.name;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join room");
    } finally {
      setActionPending(false);
      setJoiningRoomId(null);
    }
  }, [getToken, join]);

  /** Leave the call */
  const leaveSession = useCallback(async () => {
    await leave();
    setJoinedRoomId(null);
    joinedRoomNameRef.current = null;
  }, [leave]);

  // Auto-leave when the joined room disappears from the available list
  useEffect(() => {
    if (!joined || !joinedRoomId || !roomsList) return;

    const roomStillAvailable = roomsList.some((r) => r.id === joinedRoomId);
    if (!roomStillAvailable) {
      const roomName = joinedRoomNameRef.current;
      leave();
      joinedRoomNameRef.current = null;
      Promise.resolve().then(() => {
        setSessionEndedMessage(`${roomName ?? "The session"} has ended.`);
        setJoinedRoomId(null);
      });
    }
  }, [joined, joinedRoomId, roomsList, leave]);

  // Auto-leave when session window expires for group rooms
  useEffect(() => {
    if (!joined || !joinedRoomId || !roomsList) return;

    const joinedRoom = roomsList.find((r) => r.id === joinedRoomId);
    if (!joinedRoom || joinedRoom.room_type !== "group") return;
    if (joinedRoom.day_of_week == null || !joinedRoom.start_time || !joinedRoom.timezone || !joinedRoom.duration_minutes) return;

    const checkWindow = () => {
      const window = computeSessionWindow({
        day_of_week: joinedRoom.day_of_week!,
        start_time: joinedRoom.start_time!,
        timezone: joinedRoom.timezone!,
        duration_minutes: joinedRoom.duration_minutes!,
      });

      if (!window.isOpen) {
        const roomName = joinedRoomNameRef.current;
        leave();
        joinedRoomNameRef.current = null;
        setSessionEndedMessage(`${roomName ?? "The session"} has ended.`);
        setJoinedRoomId(null);
      }
    };

    // Check every 30 seconds
    const interval = setInterval(checkWindow, 30_000);
    return () => clearInterval(interval);
  }, [joined, joinedRoomId, roomsList, leave]);

  return {
    rooms,
    alwaysOpenRooms,
    openGroupRooms,
    upcomingRooms,
    isLoading: roomsLoading,
    joined,
    joining,
    joiningRoomId,
    joinedRoomId,
    sessionEndedMessage,
    error,
    actionPending,
    joinRoom,
    leaveSession,
  };
}
