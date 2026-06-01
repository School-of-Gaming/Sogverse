import { useCallback, useState } from "react";
import type { DailyCall } from "@daily-co/daily-js";
import type { AppMessage, ChatMessage } from "./types";

interface UseChatParams {
  callObjectRef: React.MutableRefObject<DailyCall | null>;
}

/** Hard caps to keep a single misbehaving client from flooding memory. */
const MAX_MESSAGE_LENGTH = 500;
const MAX_MESSAGES = 200;

/**
 * Extract a participant's display name from their Daily token's `user_name`
 * field (`userId|role|displayName|...` — see buildUserName / mapParticipant).
 * Returns "Unknown" when the participant or name slot is missing.
 */
function displayName(p: { user_name?: string } | undefined): string {
  return (p?.user_name || "").split("|")[2] || "Unknown";
}

/**
 * Ephemeral voice chat over Daily's app-message channel. Messages live only in
 * React state for the session and are never persisted — same source-of-truth
 * model as the rest of voice. `onChatMessage` and `reset` have stable
 * identities (functional state updates, no captured `messages`), so the
 * app-message listener registered at join time keeps working without
 * re-registration even as the backlog grows.
 */
export function useChat({ callObjectRef }: UseChatParams) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const append = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      // Trim the oldest once we exceed the cap.
      return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
    });
  }, []);

  const sendChatMessage = useCallback(
    (text: string) => {
      const co = callObjectRef.current;
      if (!co) return;
      const trimmed = text.trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!trimmed) return;

      const local = co.participants().local;
      const msg: AppMessage = { type: "chatMessage", text: trimmed };
      co.sendAppMessage(msg, "*");

      // Daily does not loop sendAppMessage back to the sender, so echo locally.
      append({
        id: crypto.randomUUID(),
        sessionId: local.session_id,
        userName: displayName(local),
        text: trimmed,
        timestamp: Date.now(),
        isLocal: true,
      });
    },
    [callObjectRef, append],
  );

  /** Handle an incoming chatMessage. Sender name comes from Daily's verified
   *  `fromId`, never the payload, so names can't be spoofed. */
  const onChatMessage = useCallback(
    (msg: Extract<AppMessage, { type: "chatMessage" }>, fromId: string, co: DailyCall) => {
      const text = msg.text.trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!text) return;
      append({
        id: crypto.randomUUID(),
        sessionId: fromId,
        userName: displayName(co.participants()[fromId]),
        text,
        timestamp: Date.now(),
        isLocal: false,
      });
    },
    [append],
  );

  const reset = useCallback(() => setMessages([]), []);

  return { messages, sendChatMessage, onChatMessage, reset };
}
