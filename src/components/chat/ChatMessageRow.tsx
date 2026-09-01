"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ChatReactionCode } from "@/lib/constants/chat";
import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/constants/chat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatMessageCapabilities } from "./capabilities";
import {
  chatBodyMentions,
  chatBodyPlainText,
  resolveChatMentions,
} from "./chat-body";
import { ChatBodyText } from "./ChatBodyText";
import { ChatDeliveryNote } from "./ChatDeliveryNote";
import { ChatImageRun } from "./ChatImageRun";
import { ChatMessageActions } from "./ChatMessageActions";
import { ChatQuotedMessage } from "./ChatReply";
import { ChatReactionRow } from "./ChatReactionRow";
import { ChatTombstone } from "./ChatTombstone";
import { isTouchGesture } from "./touch-gesture";
import type { ChatAccount, ChatMessage } from "./types";

/** Everything a row needs that is not the message itself. */
export interface ChatMessageRowContext {
  viewer: ChatAccount;
  accounts: ReadonlyMap<string, ChatAccount>;
  /**
   * Everyone the viewer can name, in the composer's own order — the roster an
   * edit typed in place resolves against. It has to be the *same array the
   * composer got*, because the order is what settles two accounts sharing a
   * name, and one word must not mean two people depending on which field it was
   * written in.
   */
  mentionable: readonly ChatAccount[];
  /** The message this one quotes, already resolved — `null` when it quotes none. */
  repliedTo: ChatMessage | null;
  capabilities: ChatMessageCapabilities;
  /** True while the log is flashing this row after a jump. */
  flashing: boolean;
  /**
   * True while a tap is holding this row's action bar open — the log owns it,
   * because only one row's bar may be open at a time.
   */
  actionsRevealed: boolean;
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
  /** A tap on the row itself: show this row's action bar, or put it away. */
  onToggleActions: () => void;
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
 *
 * **The editor is a composer, and it obeys the composer's rule about the token.**
 * Opening it flattens the stored body back to `@Name` and saving puts the tokens
 * back, against the same roster in the same order. That is what makes the
 * field's `maxLength` measure the sentence rather than the markup, and it is why
 * a name typed for the first time *during* an edit becomes a mention exactly as
 * it would have in the composer — a body that came out of one and goes back
 * through the other has to travel in one direction, not one and a half.
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

  const {
    viewer,
    accounts,
    mentionable,
    capabilities,
    repliedTo,
    flashing,
    actionsRevealed,
  } = context;
  const sender = accounts.get(message.senderId) ?? null;
  const hidden = message.hiddenAt !== null;
  const mentionsViewer = !hidden && chatBodyMentions(message.body, viewer.id);
  const editing = draft !== null;

  /**
   * A tap on the message itself, which is how a phone asks for the action bar.
   *
   * Three things it must not be, and each is one line here:
   *
   * - **A mouse click.** Hover has already shown the bar to a cursor, so a
   *   click that also pinned it open would only be a way to leave a bar
   *   standing on a row nobody is pointing at — and it would fire at the end of
   *   a drag that was selecting text to quote.
   * - **The tap that took an action.** The bar's own buttons, a reaction pill,
   *   the quote that jumps to an original and the picture that opens full
   *   screen all sit inside this row, and a tap on one of them is that control's
   *   answer, never also the row's. Anything that can be pressed is therefore
   *   somebody else's tap.
   * - **A tap inside the open editor.** A field being typed into is not a
   *   message being read, and the bar is not even rendered while it is up.
   */
  const tapToReveal = (event: React.MouseEvent<HTMLDivElement>) => {
    if (editing) return;
    if (!isTouchGesture(event)) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("a, button, input, textarea, select") !== null
    ) {
      return;
    }
    handlers.onToggleActions();
  };

  return (
    // No key handler beside the tap, and no role on the row: the gesture adds
    // no capability a keyboard lacks, because it only reveals a bar that is
    // already in the tab order and already appears on `focus-within`. Making
    // every message in a log a control would be the regression, not the fix.
    <div className="group relative pr-1" onClick={tapToReveal}>
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
          //
          // The colour is carried entirely by the ring, at its authored value:
          // a brand hue darkened into a ground is no longer that hue, so the
          // lift comes from the neutral accent token and both marks are told
          // apart by the ring they wear.
          mentionsViewer && "bg-accent ring-1 ring-info",
          flashing && "bg-accent ring-1 ring-primary",
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
              // The mirror of `onStartEdit` below: the field holds `@Name` and
              // the store holds `@[Name](id)`, so the token goes back on the way
              // out — which also turns a name typed for the first time here into
              // a mention, exactly as the composer would have.
              const next = resolveChatMentions(draft.trim(), mentionable);
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
            {message.image !== null && (
              <ChatImageRun
                images={[message.image]}
                // A picture-only message *is* the whole row, so there is no
                // text beside it for a tap to land on: the thumbnail carries
                // the reveal, and it reveals this row's own bar.
                revealedIndex={actionsRevealed ? 0 : null}
                onRevealIndex={handlers.onToggleActions}
              />
            )}
            {message.editedAt !== null && (
              <span className="ml-1 align-baseline text-[11px] text-muted-foreground">
                {t("edited")}
              </span>
            )}
          </>
        )}
      </div>

      {/* The round trip, and it costs this row nothing until a send actually
          fails: a pending echo's note is out of flow, so the row is the same
          height before and after the acknowledgement that turns it into the
          settled message. Nothing below it moves when the log reconciles. */}
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
          revealed={actionsRevealed}
          onReply={handlers.onReply}
          onToggleReaction={handlers.onToggleReaction}
          // Seeded with the sentence, never the markup: a writer who opened
          // their own message and found `@[Aino](3f2b…)` where they had written
          // "@Aino" would be reading the plumbing — the same thing the composer
          // refuses to show them — and the field's `maxLength` would be counting
          // characters they cannot see.
          onStartEdit={() => setDraft(chatBodyPlainText(message.body))}
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
