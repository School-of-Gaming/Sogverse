"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ArrowDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ChatReactionCode } from "@/lib/constants/chat";
import { ROLE_LABEL_KEYS } from "@/lib/constants/roles";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { cn, formatTime } from "@/lib/utils";
import { deriveChatMessageCapabilities } from "./capabilities";
import { groupChatMessages } from "./chat-grouping";
import { ChatDeliveryNote } from "./ChatDeliveryNote";
import { ChatImageRun } from "./ChatImageRun";
import { ChatMessageActions } from "./ChatMessageActions";
import { ChatMessageRow } from "./ChatMessageRow";
import { ChatReactionRow } from "./ChatReactionRow";
import { ChatQuotedMessage } from "./ChatReply";
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
  outboundToken = 0,
  heightClassName,
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
  /**
   * Bumped once per press of Send.
   *
   * The log cannot tell the viewer's own message from anybody else's by
   * counting: both are simply one more row. But the two want opposite
   * treatment — an arrival while somebody is reading history must leave them
   * where they are, and their *own* send must always take them to it, because
   * they just wrote it and looking at it is the only reason they pressed the
   * button. A token the surface bumps is what tells the two apart.
   */
  outboundToken?: number;
  /**
   * The log's fixed height, chosen by the container (see `ChatView`). Whatever
   * the value, it must be a *fixed* height — the rule in this component's
   * header is about growth, not about any one size.
   */
  heightClassName?: string;
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
  //
  // A *layout* effect, like the snap below it: both are scroll corrections, and
  // a correction that runs after the browser has painted is a visible jump
  // rather than a position the reader never saw be wrong.
  const count = messages.length;
  const seenCountRef = useRef(count);
  useLayoutEffect(() => {
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

  // The viewer's own send, unconditionally. It runs after the arrivals effect
  // above and in the same commit, so a send made while scrolled up is counted
  // as an arrival there and then taken back here — the reader ends at the
  // bottom with nothing owed, which is what pressing Send asked for.
  const seenOutboundRef = useRef(outboundToken);
  useLayoutEffect(() => {
    if (outboundToken === seenOutboundRef.current) return;
    seenOutboundRef.current = outboundToken;
    stickToBottom();
  }, [outboundToken, stickToBottom]);

  // First paint lands at the newest message: a log opened halfway up its own
  // history would be a chat nobody has read the end of.
  useLayoutEffect(() => {
    const el = logRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, []);

  // Every other way a row can change height — a reaction row appearing or
  // leaving, an edit growing a message, a tombstone replacing a picture —
  // keeps a reader at the bottom glued to the bottom, so the newest messages
  // never slide out of view under them. Deliberately dependency-free: height
  // on this surface only ever changes through a render (image boxes are
  // pre-sized), so "after every commit" is exactly the set of moments the
  // bottom edge can move, and the write is a no-op when nothing did. A reader
  // scrolled up is the browser's job instead — native scroll anchoring keeps
  // what they are looking at stable while content above them changes.
  useLayoutEffect(() => {
    const el = logRef.current;
    if (el === null || !atBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  });

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
        className={cn(
          "relative overflow-y-auto pr-1",
          heightClassName ?? "h-80 sm:h-96",
        )}
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

                  {group.items.map((item) => {
                    if (item.kind !== "message") {
                      return (
                        <ChatImageRunItem
                          key={item.messages[0].id}
                          messages={item.messages}
                          byId={byId}
                          accounts={accounts}
                          viewer={viewer}
                          viewerLocked={viewerLocked}
                          lockedAccountIds={lockedAccountIds}
                          flashId={flashId}
                          rowRefs={rowRefs}
                          jumpTo={jumpTo}
                          handlers={handlers}
                        />
                      );
                    }
                    return (
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
                    );
                  })}
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
          // The count is what the pill *says*; where pressing it goes is what it
          // does, and the two are different sentences — so the visible text
          // stays the count and the label names the destination.
          aria-label={t("jumpToLatest")}
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
 * The ref callback that keeps the id → node map in step with what is drawn.
 *
 * **A fresh closure every render, deliberately not memoised.** React therefore
 * detaches and re-attaches on each commit, which costs one map delete and one
 * map set per row and buys the property that matters: a message that leaves the
 * log takes its entry with it, so the map never grows into a pile of detached
 * DOM held alive for the life of the session. Caching a callback per id would
 * only move that bookkeeping into a second map with the same problem.
 */
function registerRow(
  refs: React.RefObject<Map<string, HTMLDivElement>>,
  id: string,
) {
  return registerRows(refs, [id]);
}

/**
 * The same, for one node standing in for several messages.
 *
 * A burst of pictures is one wrapping row and several messages, and a reply
 * quoting the *fourth* picture has to be able to jump to it — so the run's node
 * answers to every id inside it rather than only to the first, which is what a
 * jump to any but the leading picture used to fall through.
 */
function registerRows(
  refs: React.RefObject<Map<string, HTMLDivElement>>,
  ids: readonly string[],
) {
  return (node: HTMLDivElement | null) => {
    for (const id of ids) {
      if (node === null) refs.current.delete(id);
      else refs.current.set(id, node);
    }
  };
}

/**
 * A burst of pictures: one wrapping row, and everything that is per message
 * inside it.
 *
 * **The row is one visual unit and several messages, and both halves have to
 * show.** The set reads as a set — that is the whole point of folding a fan-out
 * back together — while each picture keeps its own action bar, its own
 * reactions and its own place in its own round trip, because each one *is* a
 * message a moderator can remove and the server can refuse.
 *
 * The quote goes above the run rather than on a thumbnail: the composer answers
 * one message per send, so a burst carries at most one reply target, and drawing
 * it once over the set is what says the set is the answer.
 */
function ChatImageRunItem({
  messages,
  byId,
  accounts,
  viewer,
  viewerLocked,
  lockedAccountIds,
  flashId,
  rowRefs,
  jumpTo,
  handlers,
}: {
  messages: readonly ChatMessage[];
  byId: ReadonlyMap<string, ChatMessage>;
  accounts: ReadonlyMap<string, ChatAccount>;
  viewer: ChatAccount;
  viewerLocked: boolean;
  lockedAccountIds: ReadonlySet<string>;
  flashId: string | null;
  rowRefs: React.RefObject<Map<string, HTMLDivElement>>;
  jumpTo: (messageId: string) => void;
  handlers: ChatLogHandlers;
}) {
  const quotedId =
    messages.find((message) => message.replyToId !== null)?.replyToId ?? null;
  const quoted = quotedId === null ? null : (byId.get(quotedId) ?? null);
  const flashing = messages.some((message) => message.id === flashId);

  const capabilities = messages.map((message) =>
    deriveChatMessageCapabilities(
      { viewer, locked: viewerLocked },
      message,
      accounts.get(message.senderId) ?? null,
      lockedAccountIds.has(message.senderId),
    ),
  );

  return (
    <div
      ref={registerRows(
        rowRefs,
        messages.map((message) => message.id),
      )}
      className={cn(
        // A ring and a tint, never a border: the run keeps exactly the box it
        // had, so flashing it after a jump moves nothing around it.
        "mt-1 rounded transition-colors",
        flashing && "bg-primary/20 ring-1 ring-primary",
      )}
    >
      {quoted !== null && (
        <ChatQuotedMessage
          message={quoted}
          sender={accounts.get(quoted.senderId) ?? null}
          onJump={() => jumpTo(quoted.id)}
          className="mb-0.5"
        />
      )}

      <ChatImageRun
        images={messages.map((message) => {
          // The grouping only puts image-bearing messages in a run, so this is
          // total — the fallback exists so a future grouping change fails
          // visibly rather than throwing inside a render.
          return (
            message.image ?? {
              id: message.id,
              src: "",
              width: 1,
              height: 1,
            }
          );
        })}
        deliveries={messages.map((message) => message.delivery)}
        overlay={(index) => (
          <ChatMessageActions
            sender={accounts.get(messages[index].senderId) ?? null}
            capabilities={capabilities[index]}
            unsent={messages[index].delivery !== "sent"}
            onReply={() => handlers.onReply(messages[index].id)}
            onToggleReaction={(code) =>
              handlers.onToggleReaction(messages[index].id, code)
            }
            onStartEdit={() => undefined}
            onDelete={() => handlers.onDelete(messages[index].id)}
            onHide={() => handlers.onHide(messages[index].id)}
            onRestore={() => handlers.onRestore(messages[index].id)}
            onSetLock={(locked) =>
              handlers.onSetLock(messages[index].senderId, locked)
            }
            // The thumbnail is the hover target here, not a text row, so the
            // bar keys off the picture's own group rather than a row's.
            className="group-hover/thumb:opacity-100"
          />
        )}
        footer={(index) => (
          <>
            <ChatDeliveryNote
              delivery={messages[index].delivery}
              onRetry={() => handlers.onRetry(messages[index].id)}
            />
            <ChatReactionRow
              reactions={messages[index].reactions}
              viewerId={viewer.id}
              canReact={capabilities[index].canReact}
              onToggle={(code) =>
                handlers.onToggleReaction(messages[index].id, code)
              }
              className="mt-1"
            />
          </>
        )}
      />
    </div>
  );
}
