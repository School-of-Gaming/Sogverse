"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatReactionCode } from "@/lib/constants/chat";
import { toggleChatReaction, type ChatSendDraft, type ChatMessage } from "@/components/chat";
import {
  CHAT_ACCOUNT_IDS,
  CHAT_SCENE_INCOMING,
  CHAT_SCENE_LOCKED_IDS,
  buildChatSceneMessages,
} from "@/components/chat/mock-chat-fixtures";

/**
 * The chat scene's whole backend.
 *
 * Everything the wire-up will do over a socket happens here against local
 * state, which is the honest half of a mock: it is ~95% truthful about how the
 * feature behaves under your fingers and 0% truthful about the wire, and this
 * module claims only the first. Nothing here asserts anything about
 * authorization either — the capability derivation the components read is the
 * production module, and it is fed real fixture state rather than waved through.
 *
 * **Held apart from the scene component** so the scene is a layout plus a
 * control strip, and the behaviour it is driving can be read in one file.
 */

/**
 * How the fixture answers a send.
 *
 * `instant` is the design at rest. `slow` is what makes the pending bubble
 * visible at all — it is on screen for a frame otherwise. `failing` refuses the
 * *first* attempt at each message and accepts the retry, because a mode that
 * refused for ever would show the failed bubble and never the thing it exists
 * to lead to.
 */
export type ChatSceneLatency = "instant" | "slow" | "failing";

/** How long `slow` and `failing` take to answer. */
const LATENCY_MS = 1200;

/** How long a scripted sender appears to be typing before their line lands. */
const TYPING_MS = 1100;

/** The gap between scripted arrivals while the auto toggle is on. */
const AUTO_INTERVAL_MS = 5000;

export interface ChatSceneStore {
  messages: ChatMessage[];
  viewerId: string;
  setViewerId: (id: string) => void;
  lockedIds: ReadonlySet<string>;
  typingIds: string[];
  latency: ChatSceneLatency;
  setLatency: (latency: ChatSceneLatency) => void;
  auto: boolean;
  setAuto: (auto: boolean) => void;
  /** Fire one scripted arrival now. */
  sendScripted: () => void;
  send: (drafts: ChatSendDraft[]) => void;
  retry: (messageId: string) => void;
  edit: (messageId: string, body: string) => void;
  remove: (messageId: string) => void;
  restore: (messageId: string) => void;
  toggleReaction: (messageId: string, code: ChatReactionCode) => void;
  setLock: (accountId: string, locked: boolean) => void;
}

export function useChatSceneStore(now: Date): ChatSceneStore {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    buildChatSceneMessages(now),
  );
  const [viewerId, setViewerId] = useState<string>(CHAT_ACCOUNT_IDS.sanna);
  const [lockedIds, setLockedIds] = useState<ReadonlySet<string>>(
    () => new Set(CHAT_SCENE_LOCKED_IDS),
  );
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const [latency, setLatency] = useState<ChatSceneLatency>("instant");
  const [auto, setAuto] = useState(false);

  // Every *still pending* timer, so unmounting the scene does not leave one
  // firing into a store nobody is rendering. A handle drops out of the set as
  // it fires: a scene somebody leaves open with the activity toggle on would
  // otherwise accumulate one dead id per arrival for as long as it is up.
  const timers = useRef(new Set<number>());
  const scriptCursor = useRef(0);
  // Which messages `failing` has already refused once, so the retry lands. An
  // id drops out the moment its message settles as sent — the set is answering
  // "is this attempt the first one?", and once a message is through it has no
  // further attempts to be asked about. Keeping it would leave one dead string
  // per send for as long as the scene is open.
  const alreadyFailed = useRef(new Set<string>());

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
    };
  }, []);

  const patch = useCallback(
    (messageId: string, change: Partial<ChatMessage>) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId ? { ...message, ...change } : message,
        ),
      );
    },
    [],
  );

  /**
   * The round trip a sent message takes, per the current latency mode.
   *
   * **The mode is read at send time and holds for that message**, because the
   * closure captures it: flipping the control to `instant` while a slow send is
   * in the air still lands that send slowly. That is chosen rather than
   * incidental — a message's fate settled when it left is what a real transport
   * does, and re-reading the mode mid-flight would make the control able to
   * rewrite history that is already on screen.
   */
  const settle = useCallback(
    (messageId: string) => {
      if (latency === "instant") {
        // Reachable with an id in the set: a message refused under `failing`,
        // then retried after the control was flipped back to `instant`.
        alreadyFailed.current.delete(messageId);
        patch(messageId, { delivery: "sent" });
        return;
      }
      later(() => {
        const shouldFail =
          latency === "failing" && !alreadyFailed.current.has(messageId);
        if (shouldFail) alreadyFailed.current.add(messageId);
        else alreadyFailed.current.delete(messageId);
        patch(messageId, { delivery: shouldFail ? "failed" : "sent" });
      }, LATENCY_MS);
    },
    [latency, later, patch],
  );

  const send = useCallback(
    (drafts: ChatSendDraft[]) => {
      const created = drafts.map((draft) => ({
        id: `local-${crypto.randomUUID()}`,
        senderId: viewerId,
        createdAt: new Date().toISOString(),
        body: draft.body,
        image:
          draft.image === null
            ? null
            : {
                id: draft.image.key,
                src: draft.image.src,
                width: draft.image.width,
                height: draft.image.height,
              },
        replyToId: draft.replyToId,
        editedAt: null,
        hiddenAt: null,
        hiddenBy: null,
        reactions: [],
        // The optimistic echo: the sender's own message is on screen before
        // anything has acknowledged it, which is the feel-defining behaviour of
        // the whole build and the reason `pending` exists at all.
        delivery: latency === "instant" ? ("sent" as const) : ("pending" as const),
      }));
      setMessages((current) => [...current, ...created]);
      if (latency !== "instant") {
        for (const message of created) settle(message.id);
      }
    },
    [latency, settle, viewerId],
  );

  const sendScripted = useCallback(() => {
    const line = CHAT_SCENE_INCOMING[scriptCursor.current % CHAT_SCENE_INCOMING.length];
    scriptCursor.current += 1;

    setTypingIds((current) =>
      current.includes(line.senderId) ? current : [...current, line.senderId],
    );
    later(() => {
      setTypingIds((current) => current.filter((id) => id !== line.senderId));
      setMessages((current) => [
        ...current,
        {
          id: `script-${crypto.randomUUID()}`,
          senderId: line.senderId,
          createdAt: new Date().toISOString(),
          body: line.body,
          image: null,
          replyToId: null,
          editedAt: null,
          hiddenAt: null,
          hiddenBy: null,
          reactions: [],
          delivery: "sent",
        },
      ]);
    }, TYPING_MS);
  }, [later]);

  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(sendScripted, AUTO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [auto, sendScripted]);

  return {
    messages,
    viewerId,
    setViewerId,
    lockedIds,
    typingIds,
    latency,
    setLatency,
    auto,
    setAuto,
    sendScripted,
    send,
    retry: (messageId) => {
      patch(messageId, { delivery: "pending" });
      settle(messageId);
    },
    edit: (messageId, body) =>
      patch(messageId, { body, editedAt: new Date().toISOString() }),
    // Self-delete and a moderator's removal are the same write, which is what
    // makes them the same tombstone: only `hiddenBy` differs, and nothing on
    // screen reads it.
    //
    // **Except on a message the server never took.** A `failed` row is an
    // optimistic echo nobody else has ever seen, so there is nothing to
    // tombstone and nobody to tell — deleting it drops it. Leaving a "this
    // message was removed" marker behind would be announcing a message that
    // never existed, and it is the sender's own log it would sit in.
    remove: (messageId) =>
      setMessages((current) =>
        current.flatMap((message) => {
          if (message.id !== messageId) return [message];
          if (message.delivery !== "sent") return [];
          return [
            {
              ...message,
              hiddenAt: new Date().toISOString(),
              hiddenBy: viewerId,
            },
          ];
        }),
      ),
    restore: (messageId) => patch(messageId, { hiddenAt: null, hiddenBy: null }),
    toggleReaction: (messageId, code) =>
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                reactions: toggleChatReaction(message.reactions, code, viewerId),
              }
            : message,
        ),
      ),
    setLock: (accountId, locked) =>
      setLockedIds((current) => {
        const next = new Set(current);
        if (locked) next.add(accountId);
        else next.delete(accountId);
        return next;
      }),
  };
}
