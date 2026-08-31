"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ChatReactionCode } from "@/lib/constants/chat";
import { ROLE_LABEL_KEYS } from "@/lib/constants/roles";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { cn, formatTime } from "@/lib/utils";
import { deriveChatMessageCapabilities } from "./capabilities";
import { groupChatMessages } from "./chat-grouping";
import { ChatImageRun } from "./ChatImageRun";
import { ChatMessageActions } from "./ChatMessageActions";
import { ChatMessageRow } from "./ChatMessageRow";
import type { ChatAccount, ChatMessage } from "./types";

/** Everything the log can ask the surface to do, keyed by message. */
export interface ChatLogHandlers {
  onReply: (messageId: string) => void;
  onToggleReaction: (messageId: string, code: ChatReactionCode) => void;
  onEdit: (messageId: string, body: string) => void;
  onDelete: (messageId: string) => void;
  onHide: (messageId: string) => void;
  onRestore: (messageId: string) => void;
  onSetLock: (accountId: string, locked: boolean) => void;
  onRetry: (messageId: string) => void;
}

/** How long a jumped-to message stays highlighted. */
const FLASH_MS = 1400;

/** How close to the bottom still counts as "following the conversation". */
const STICK_TOLERANCE_PX = 24;

/**
 * The message log: a fixed-height scroll region that follows the conversation.
 *
 * **Fixed height, always.** A log that grew with its content would push
 * whatever sits under it — a composer, a participant rail — down the page on
 * every message, which is a change on data's own schedule and forbidden
 * outright. So the box is the box, and messages move inside it.
 *
 * **It sticks to the bottom only for a reader who is already there.** Somebody
 * who scrolled up to re-read something keeps their exact position while new
 * messages land beneath them; what they get instead is a count and one press to
 * come back. Yanking them down would be the same defect the fixed height
 * prevents, one level in.
 *
 * **A reply's quote scrolls to its original inside this box**, never through
 * `scrollIntoView`, which would scroll the *page* and take the whole dashboard
 * with it.
 */
export function ChatMessageList({
  messages,
  accounts,
  viewer,
  viewerLocked,
  lockedAccountIds,
  timeZone,
  handlers,
  className,
}: {
  messages: readonly ChatMessage[];
  accounts: ReadonlyMap<string, ChatAccount>;
  viewer: ChatAccount;
  /** Whether the viewer is locked — takes every writing affordance away. */
  viewerLocked: boolean;
  /** Who is locked, so a moderator's menu points the right way. */
  lockedAccountIds: ReadonlySet<string>;
  /** The viewer's own zone. Every clock face in the log renders in it. */
  timeZone: string;
  handlers: ChatLogHandlers;
  className?: string;
}) {
  const t = useTranslations("chat");
  const common = useTranslations("common");
  const locale = useLocale();

  const logRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const atBottomRef = useRef(true);
  const [behind, setBehind] = useState(0);
  const [flashId, setFlashId] = useState<string | null>(null);

  const byId = new Map(messages.map((message) => [message.id, message]));
  const groups = groupChatMessages(messages);

  const stickToBottom = useCallback(() => {
    const el = logRef.current;
    if (el === null) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setBehind(0);
  }, []);

  const handleScroll = () => {
    const el = logRef.current;
    if (el === null) return;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TOLERANCE_PX;
    atBottomRef.current = atBottom;
    if (atBottom) setBehind(0);
  };

  // Follow the conversation for whoever is following it, and count for whoever
  // is not. Keyed on the message count rather than the array, so an edit or a
  // reaction landing on an old message does not read as an arrival.
  const count = messages.length;
  const seenCountRef = useRef(count);
  useEffect(() => {
    const arrived = count - seenCountRef.current;
    seenCountRef.current = count;
    if (arrived <= 0) return;
    const el = logRef.current;
    if (el === null) return;
    if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      setBehind((behindNow) => behindNow + arrived);
    }
  }, [count]);

  // First paint lands at the newest message: a log opened halfway up its own
  // history would be a chat nobody has read the end of.
  useEffect(() => {
    const el = logRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (flashId === null) return;
    const timer = window.setTimeout(() => setFlashId(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flashId]);

  const jumpTo = (messageId: string) => {
    const el = logRef.current;
    const row = rowRefs.current.get(messageId);
    if (el === null || row === undefined) return;
    // Centre it in the box by arithmetic on the log's own scrollTop — never
    // `scrollIntoView`, which would scroll every ancestor that can scroll and
    // move the page out from under the reader.
    el.scrollTop = Math.max(
      0,
      row.offsetTop - el.clientHeight / 2 + row.clientHeight / 2,
    );
    setFlashId(messageId);
  };

  return (
    <div className={cn("relative", className)}>
      <div
        ref={logRef}
        onScroll={handleScroll}
        aria-label={t("log")}
        role="log"
        className="relative h-72 overflow-y-auto pr-1 sm:h-80"
      >
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          groups.map((group) => {
            const sender = accounts.get(group.senderId) ?? null;
            return (
              <div key={group.key} className="mt-3 flex gap-2 first:mt-0">
                <Avatar className="mt-0.5 h-8 w-8">
                  <Identicon id={group.senderId} size={32} />
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-1.5">
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        group.senderId === viewer.id
                          ? "text-primary"
                          : "text-foreground",
                      )}
                    >
                      {sender?.name ?? ""}
                    </span>
                    {sender !== null && sender.role !== "gamer" && (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {common(ROLE_LABEL_KEYS[sender.role])}
                      </span>
                    )}
                    {lockedAccountIds.has(group.senderId) && (
                      <span className="text-[10px] uppercase tracking-wide text-destructive">
                        {t("moderation.lockedTag")}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {formatTime(group.startedAt, locale, timeZone)}
                    </span>
                  </p>

                  {group.items.map((item) =>
                    item.kind === "message" ? (
                      <div
                        key={item.message.id}
                        ref={registerRow(rowRefs, item.message.id)}
                      >
                        <ChatMessageRow
                          message={item.message}
                          context={{
                            viewer,
                            accounts,
                            repliedTo:
                              item.message.replyToId === null
                                ? null
                                : (byId.get(item.message.replyToId) ?? null),
                            capabilities: deriveChatMessageCapabilities(
                              { viewer, locked: viewerLocked },
                              item.message,
                              accounts.get(item.message.senderId) ?? null,
                              lockedAccountIds.has(item.message.senderId),
                            ),
                            flashing: flashId === item.message.id,
                          }}
                          handlers={{
                            onReply: () => handlers.onReply(item.message.id),
                            onJumpTo: jumpTo,
                            onToggleReaction: (code) =>
                              handlers.onToggleReaction(item.message.id, code),
                            onSubmitEdit: (body) =>
                              handlers.onEdit(item.message.id, body),
                            onDelete: () => handlers.onDelete(item.message.id),
                            onHide: () => handlers.onHide(item.message.id),
                            onRestore: () => handlers.onRestore(item.message.id),
                            onSetLock: (locked) =>
                              handlers.onSetLock(item.message.senderId, locked),
                            onRetry: () => handlers.onRetry(item.message.id),
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        key={item.messages[0].id}
                        ref={registerRow(rowRefs, item.messages[0].id)}
                        className="mt-1"
                      >
                        <ChatImageRun
                          images={item.messages.map((message) => {
                            // The grouping only puts image-bearing messages in
                            // a run, so this is total — the fallback exists so
                            // a future grouping change fails visibly rather
                            // than throwing inside a render.
                            return (
                              message.image ?? {
                                id: message.id,
                                src: "",
                                width: 1,
                                height: 1,
                              }
                            );
                          })}
                          overlay={(index) => (
                            <ChatMessageActions
                              sender={
                                accounts.get(item.messages[index].senderId) ??
                                null
                              }
                              capabilities={deriveChatMessageCapabilities(
                                { viewer, locked: viewerLocked },
                                item.messages[index],
                                accounts.get(item.messages[index].senderId) ??
                                  null,
                                lockedAccountIds.has(
                                  item.messages[index].senderId,
                                ),
                              )}
                              onReply={() =>
                                handlers.onReply(item.messages[index].id)
                              }
                              onToggleReaction={(code) =>
                                handlers.onToggleReaction(
                                  item.messages[index].id,
                                  code,
                                )
                              }
                              onStartEdit={() => undefined}
                              onDelete={() =>
                                handlers.onDelete(item.messages[index].id)
                              }
                              onHide={() =>
                                handlers.onHide(item.messages[index].id)
                              }
                              onRestore={() =>
                                handlers.onRestore(item.messages[index].id)
                              }
                              onSetLock={(locked) =>
                                handlers.onSetLock(
                                  item.messages[index].senderId,
                                  locked,
                                )
                              }
                              // The thumbnail is the hover target here, not a
                              // text row, so the bar keys off the picture's own
                              // group rather than a row's.
                              className="group-hover/thumb:opacity-100"
                            />
                          )}
                        />
                      </div>
                    ),
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {behind > 0 && (
        <button
          type="button"
          onClick={stickToBottom}
          // Over the log rather than under it: a control that appeared *below*
          // the box would push the composer down the moment a message arrived
          // while somebody was reading history.
          className="absolute bottom-2 right-3 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-lg"
        >
          <ArrowDown className="h-3 w-3" aria-hidden />
          {t("unread", { count: behind })}
        </button>
      )}
    </div>
  );
}

/**
 * A stable ref callback per message id.
 *
 * Written as a helper so the map's entry is cleaned up on unmount — a log that
 * held nodes for every message it has ever drawn would keep detached DOM alive
 * for the life of the session.
 */
function registerRow(
  refs: React.RefObject<Map<string, HTMLDivElement>>,
  id: string,
) {
  return (node: HTMLDivElement | null) => {
    if (node === null) refs.current.delete(id);
    else refs.current.set(id, node);
  };
}
