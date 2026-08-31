"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { deriveChatComposerCapabilities } from "./capabilities";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageList, type ChatLogHandlers } from "./ChatMessageList";
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
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <ChatMessageList
          messages={messages}
          accounts={byId}
          viewer={viewer}
          viewerLocked={viewerLocked}
          lockedAccountIds={lockedAccountIds}
          timeZone={timeZone}
          handlers={logHandlers}
          outboundToken={outboundToken}
        />
        <ChatTypingIndicator names={typingNames} />
      </div>

      <ChatComposer
        capabilities={deriveChatComposerCapabilities({
          viewer,
          locked: viewerLocked,
        })}
        accounts={accounts.filter((account) => account.id !== viewer.id)}
        replyingTo={replyingTo}
        replyingToSender={
          replyingTo === null ? null : (byId.get(replyingTo.senderId) ?? null)
        }
        onCancelReply={() => setReplyToId(null)}
        onSend={(drafts) => {
          handlers.onSend(drafts);
          setReplyToId(null);
          setOutboundToken((token) => token + 1);
        }}
      />
    </div>
  );
}

/**
 * Who is writing, over the foot of the log.
 *
 * **Absolutely positioned, so it holds no space.** A typing indicator arrives
 * and leaves on somebody else's schedule — the one kind of change the layout
 * rule forbids outright — so it must not be able to move the composer under a
 * reader's thumb. Sitting over the log's last line, on the log's own ground,
 * costs a line of history for the second or two it is up and moves nothing.
 */
function ChatTypingIndicator({ names }: { names: readonly string[] }) {
  const t = useTranslations("chat.typing");
  if (names.length === 0) return null;

  const label =
    names.length === 1
      ? t("one", { name: names[0] })
      : names.length === 2
        ? t("two", { first: names[0], second: names[1] })
        : t("many");

  return (
    <p className="pointer-events-none absolute bottom-1 left-2 rounded bg-card/90 px-1.5 py-0.5 text-xs italic text-muted-foreground">
      {label}
    </p>
  );
}
