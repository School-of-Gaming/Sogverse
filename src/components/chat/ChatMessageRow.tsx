"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ChatReactionCode } from "@/lib/constants/chat";
import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/constants/chat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatMessageCapabilities } from "./capabilities";
import { chatBodyMentions } from "./chat-body";
import { ChatBodyText } from "./ChatBodyText";
import { ChatDeliveryNote } from "./ChatDeliveryNote";
import { ChatImageRun } from "./ChatImageRun";
import { ChatMessageActions } from "./ChatMessageActions";
import { ChatQuotedMessage } from "./ChatReply";
import { ChatReactionRow } from "./ChatReactionRow";
import { ChatTombstone } from "./ChatTombstone";
import type { ChatAccount, ChatMessage } from "./types";

/** Everything a row needs that is not the message itself. */
export interface ChatMessageRowContext {
  viewer: ChatAccount;
  accounts: ReadonlyMap<string, ChatAccount>;
  /** The message this one quotes, already resolved — `null` when it quotes none. */
  repliedTo: ChatMessage | null;
  capabilities: ChatMessageCapabilities;
  /** True while the log is flashing this row after a jump. */
  flashing: boolean;
}

/** What a row can ask the surface to do. */
export interface ChatMessageRowHandlers {
  onReply: () => void;
  onJumpTo: (messageId: string) => void;
  onToggleReaction: (code: ChatReactionCode) => void;
  onSubmitEdit: (body: string) => void;
  onDelete: () => void;
  onHide: () => void;
  onRestore: () => void;
  onSetLock: (locked: boolean) => void;
  onRetry: () => void;
}

/**
 * One message, inside its sender's run.
 *
 * The row draws no name and no avatar: those belong to the run and are drawn
 * once above it, which is the whole of what sender grouping buys. What is per
 * message is the quote it carries, its words or its picture, its reactions, and
 * where it is in its round trip.
 *
 * **The edit happens in place.** Replacing the words with a field keeps the
 * message where it is in the log rather than lifting it into a dialog and
 * losing the conversation around it. Nothing survives that swap — the read view
 * is gone and the editor is there instead — so the layout rule has nothing to
 * say about the size difference between them.
 */
export function ChatMessageRow({
  message,
  context,
  handlers,
}: {
  message: ChatMessage;
  context: ChatMessageRowContext;
  handlers: ChatMessageRowHandlers;
}) {
  const t = useTranslations("chat.message");
  const te = useTranslations("chat.editor");
  const [draft, setDraft] = useState<string | null>(null);

  const { viewer, accounts, capabilities, repliedTo, flashing } = context;
  const sender = accounts.get(message.senderId) ?? null;
  const hidden = message.hiddenAt !== null;
  const mentionsViewer = !hidden && chatBodyMentions(message.body, viewer.id);
  const editing = draft !== null;

  return (
    <div className="group relative pr-1">
      {repliedTo !== null && (
        <ChatQuotedMessage
          message={repliedTo}
          sender={accounts.get(repliedTo.senderId) ?? null}
          onJump={() => handlers.onJumpTo(repliedTo.id)}
          className="mb-0.5"
        />
      )}

      <div
        className={cn(
          "rounded px-1.5 py-0.5 text-sm leading-snug transition-colors",
          // A ring and a tint, never a border: both leave the box exactly the
          // size it was, so a message that becomes highlighted — because a
          // reply jumped to it, or because it names the reader — moves nothing.
          //
          // The two highlights are deliberately different colours, because they
          // are different sentences. **Info is the mention colour** — the same
          // token the chip inside the body wears, so "this one is about you"
          // reads the same wherever it appears. The flash stays **primary**: it
          // is not a mention, it is the log pointing at where a jump landed,
          // and it fades after a second.
          mentionsViewer && "bg-info/10 ring-1 ring-info/40",
          flashing && "bg-primary/20 ring-1 ring-primary",
          message.delivery === "pending" && "opacity-60",
        )}
      >
        {/* The ring says "this one is about you" to whoever can see it; this is
            the same sentence for whoever cannot. */}
        {mentionsViewer && <span className="sr-only">{t("mentionsYou")}</span>}
        {hidden ? (
          <>
            <ChatTombstone withOriginal={capabilities.canSeeHiddenBody} />
            {capabilities.canSeeHiddenBody && (
              <div className="mt-1 border-l-2 border-border pl-2 text-muted-foreground/70">
                {message.body !== null && (
                  <ChatBodyText body={message.body} accounts={accounts} />
                )}
                {message.image !== null && (
                  <ChatImageRun images={[message.image]} className="opacity-50" />
                )}
              </div>
            )}
          </>
        ) : editing ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const next = draft.trim();
              if (next.length > 0) handlers.onSubmitEdit(next);
              setDraft(null);
            }}
            className="space-y-2 py-1"
          >
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={MAX_CHAT_MESSAGE_LENGTH}
              aria-label={te("label")}
              rows={2}
              autoFocus
            />
            <EditActions onCancel={() => setDraft(null)} />
          </form>
        ) : (
          <>
            {message.body !== null && (
              <ChatBodyText body={message.body} accounts={accounts} />
            )}
            {message.image !== null && <ChatImageRun images={[message.image]} />}
            {message.editedAt !== null && (
              <span className="ml-1 align-baseline text-[11px] text-muted-foreground">
                {t("edited")}
              </span>
            )}
          </>
        )}
      </div>

      <ChatDeliveryNote
        delivery={message.delivery}
        onRetry={handlers.onRetry}
        className="px-1.5"
      />

      {/* A removed message shows no reactions, to anybody. The tally is a
          record of what people thought of words that are no longer on screen —
          six laughing faces under a tombstone tell a reader what kind of
          message it was, which is exactly what removing it took away. The
          reactions themselves are untouched in the data; this is only whether
          they are drawn. (A moderator still reads the dimmed original above:
          that is the soft delete doing its job, and it is deliberate that the
          people who can see the body are the only ones the reactions would
          have told anything new.) */}
      {!hidden && (
        <ChatReactionRow
          reactions={message.reactions}
          viewerId={viewer.id}
          canReact={capabilities.canReact}
          onToggle={handlers.onToggleReaction}
          className="mt-1 px-1.5"
        />
      )}

      {!editing && (
        <ChatMessageActions
          sender={sender}
          capabilities={capabilities}
          unsent={message.delivery !== "sent"}
          onReply={handlers.onReply}
          onToggleReaction={handlers.onToggleReaction}
          onStartEdit={() => setDraft(message.body ?? "")}
          onDelete={handlers.onDelete}
          onHide={handlers.onHide}
          onRestore={handlers.onRestore}
          onSetLock={handlers.onSetLock}
        />
      )}
    </div>
  );
}

/**
 * Cancel and Save.
 *
 * DOM order `[negative, affirmative]` under `flex-col-reverse sm:flex-row`, so
 * the affirmative is rightmost in a row and topmost in a stack — the app-wide
 * button order, stated here because this row is hand-rolled rather than a
 * `DialogFooter`.
 */
function EditActions({ onCancel }: { onCancel: () => void }) {
  const t = useTranslations("chat.editor");
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        {t("cancel")}
      </Button>
      <Button type="submit" size="sm">
        {t("save")}
      </Button>
    </div>
  );
}
