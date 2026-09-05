"use client";

import { CornerUpLeft, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { chatBodyPlainText } from "./chat-body";
import type { ChatAccount, ChatMessage } from "./types";

/**
 * Replies, in the two places they show.
 *
 * **Inline quote-replies, one flat log.** A reply carries a snippet of what it
 * answers and tapping that snippet scrolls to the original — the WhatsApp and
 * Discord shape everybody already has in their hands. No thread panes, no
 * second reading order, nothing for a child to get lost in.
 */

/** What a quoted message reduces to on one line. */
function quotedPreview(
  message: ChatMessage,
  t: (key: "image" | "removed") => string,
): string {
  if (message.hiddenAt !== null) return t("removed");
  if (message.image !== null) return t("image");
  return chatBodyPlainText(message.body);
}

/**
 * The snippet a reply carries, above its own words.
 *
 * A button, because tapping it goes somewhere: the log scrolls the original
 * into view and flashes it. Its label names the person rather than the words,
 * since the words are already read out by the snippet itself.
 */
export function ChatQuotedMessage({
  message,
  sender,
  onJump,
  className,
}: {
  message: ChatMessage;
  sender: ChatAccount | null;
  onJump: () => void;
  className?: string;
}) {
  const t = useTranslations("chat.reply");
  const name = sender?.name ?? "";
  return (
    <button
      type="button"
      onClick={onJump}
      aria-label={t("jump", { name })}
      className={cn(
        "flex w-full items-start gap-1.5 rounded border-l-2 border-border bg-muted/60 px-2 py-1 text-left text-xs transition-colors hover:bg-muted",
        className,
      )}
    >
      <CornerUpLeft className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
      {/* One line, clipped: the quote is a pointer to the original, and a
          quoted paragraph would push the reply's own words off the screen. */}
      <span className="flex min-w-0 flex-1 gap-1 overflow-hidden">
        <span className="shrink-0 font-medium text-primary">{name}</span>
        <span className="truncate text-muted-foreground">
          {quotedPreview(message, t)}
        </span>
      </span>
    </button>
  );
}

/**
 * The strip shown while a reply is being written.
 *
 * It renders at the *bottom of the log's fixed-height column* (the view places
 * it), so its height comes out of the log rather than being added to the
 * surface: starting or cancelling a reply never resizes the chat, and the
 * bottom-glued log means what a reader at the bottom sees is the messages
 * sliding up by one strip.
 */
export function ChatReplyStrip({
  message,
  sender,
  onCancel,
  className,
}: {
  message: ChatMessage;
  sender: ChatAccount | null;
  onCancel: () => void;
  className?: string;
}) {
  const t = useTranslations("chat.reply");
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs",
        className,
      )}
    >
      <CornerUpLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-primary">
          {t("banner", { name: sender?.name ?? "" })}
        </p>
        <p className="truncate text-muted-foreground">
          {quotedPreview(message, t)}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onCancel}
        aria-label={t("cancel")}
        className="h-6 w-6 shrink-0"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </div>
  );
}
