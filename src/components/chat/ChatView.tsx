"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { deriveChatComposerCapabilities } from "./capabilities";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageList, type ChatLogHandlers } from "./ChatMessageList";
import { ChatReplyStrip } from "./ChatReply";
import type { ChatSendDraft } from "./composer-staging";
import type { ChatAccount, ChatMessage } from "./types";

/**
 * Everything a surface has to answer for the chat it is showing.
 *
 * `onReply` is deliberately absent: which message is being answered is state
 * about *looking at* a chat, so the view owns it and nothing outside is asked.
 */
export type ChatViewHandlers = Omit<ChatLogHandlers, "onReply"> & {
  /**
   * One press of Send, already fanned out: one draft per staged picture, then
   * the words. The surface turns each into a message — optimistically, which is
   * what the pending and failed bubbles are for.
   */
  onSend: (drafts: ChatSendDraft[]) => void;
};

/**
 * The whole chat surface: the log, who is writing, and the composer.
 *
 * **Transport-free by construction.** It takes messages and hands back
 * intentions; it opens no socket, holds no query and knows nothing about where
 * its rows came from. That is what lets the preview scene drive it from local
 * fixtures and the voice room drive it from a live subscription, with the same
 * component and no branch inside it — and it is what makes the design signed
 * off in fixtures the design that ships.
 *
 * What it *does* own is the state that is purely about looking at a chat:
 * which message is being replied to. Nothing outside a chat surface has a use
 * for that, and threading it through a page would only give a second copy the
 * chance to disagree.
 */
export function ChatView({
  messages,
  accounts,
  viewer,
  lockedAccountIds,
  typingAccountIds,
  logHeightClassName,
  timeZone,
  handlers,
  className,
}: {
  /** Oldest first — the render order. Nothing here sorts. */
  messages: readonly ChatMessage[];
  accounts: readonly ChatAccount[];
  viewer: ChatAccount;
  /** Who a moderator has locked out of this chat. */
  lockedAccountIds: ReadonlySet<string>;
  /** Who is typing right now. The viewer is ignored if they appear. */
  typingAccountIds: readonly string[];
  /**
   * The fixed height of the log area, as a class the container chooses.
   * Geometry belongs to whatever embeds the chat — a voice-room panel and a
   * future full-page surface want different boxes around the same behaviour.
   * The height covers the log *plus* the reply strip while one is up: a reply
   * borrows its space from the log, so the surface never changes size.
   */
  logHeightClassName?: string;
  /** The viewer's own IANA zone — every clock face renders in it. */
  timeZone: string;
  handlers: ChatViewHandlers;
  className?: string;
}) {
  const [replyToId, setReplyToId] = useState<string | null>(null);
  // One press of Send, counted. The log cannot tell the viewer's own arrival
  // from anybody else's, and the two want opposite scroll behaviour — so the
  // view, which knows which of the two just happened, says so.
  const [outboundToken, setOutboundToken] = useState(0);

  const byId = new Map(accounts.map((account) => [account.id, account]));
  const viewerLocked = lockedAccountIds.has(viewer.id);
  const replyingTo =
    replyToId === null
      ? null
      : (messages.find((message) => message.id === replyToId) ?? null);

  const typingNames = typingAccountIds
    .filter((id) => id !== viewer.id)
    .map((id) => byId.get(id)?.name)
    .filter((name): name is string => name !== undefined);

  const logHandlers: ChatLogHandlers = {
    ...handlers,
    onReply: (messageId) => setReplyToId(messageId),
  };

  return (
    <div className={cn("relative space-y-2", className)}>
      {/* One fixed-height column for the log *and* the reply strip: starting a
          reply hands the strip its height out of the log's, so the composer
          and everything below the chat hold their position through every
          composer state. The log is glued to its bottom, so what a reader at
          the bottom sees is the messages sliding up by one strip, not the
          page changing shape. */}
      <div className={cn("flex flex-col", logHeightClassName ?? "h-80 sm:h-96")}>
        <ChatMessageList
          messages={messages}
          accounts={byId}
          viewer={viewer}
          viewerLocked={viewerLocked}
          lockedAccountIds={lockedAccountIds}
          timeZone={timeZone}
          handlers={logHandlers}
          outboundToken={outboundToken}
          heightClassName="h-full"
          className="min-h-0 flex-1"
        />
        {replyingTo !== null && (
          <ChatReplyStrip
            message={replyingTo}
            sender={byId.get(replyingTo.senderId) ?? null}
            onCancel={() => setReplyToId(null)}
            className="mt-1 shrink-0"
          />
        )}
      </div>

      <ChatComposer
        capabilities={deriveChatComposerCapabilities({
          viewer,
          locked: viewerLocked,
        })}
        accounts={accounts.filter((account) => account.id !== viewer.id)}
        replyingTo={replyingTo}
        onSend={(drafts) => {
          handlers.onSend(drafts);
          setReplyToId(null);
          setOutboundToken((token) => token + 1);
        }}
      />
      <ChatTypingIndicator names={typingNames} />
    </div>
  );
}

/**
 * Who is writing — overlaid on the embedding container's own bottom padding,
 * below the composer. The fourth cut of this component, and the stable one.
 *
 * An indicator arrives and leaves on somebody else's schedule — the one kind
 * of change the layout rule forbids outright — so it cannot take space in
 * flow. The cuts before this one each traded that away differently: over the
 * log's last line it made exactly the line a reader was mid-way through
 * unreadable; as a reserved in-flow line (between log and composer, then
 * below the composer) the line read as a padding mistake whenever nobody was
 * typing. Absolutely positioned just past the surface's bottom edge, it lands
 * in the container's bottom padding: space that already exists, holds no
 * content to cover, and is not read as a slot when empty (owner rulings,
 * 2026-09-01).
 *
 * **The contract this buys: whatever embeds the chat must leave at least one
 * text line of bottom padding under it.** A `CardContent` does; a future
 * flush-to-the-edge embedding would clip the label and needs its own padding.
 */
function ChatTypingIndicator({ names }: { names: readonly string[] }) {
  const t = useTranslations("chat.typing");
  const label =
    names.length === 0
      ? null
      : names.length === 1
        ? t("one", { name: names[0] })
        : names.length === 2
          ? t("two", { first: names[0], second: names[1] })
          : t("many");

  return (
    <p
      aria-live="polite"
      className="pointer-events-none absolute inset-x-1 top-full mt-1 truncate text-xs italic leading-4 text-muted-foreground"
    >
      {label}
    </p>
  );
}
