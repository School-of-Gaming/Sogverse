"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Lock, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_STAGED_CHAT_IMAGES,
} from "@/lib/constants/chat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatComposerCapabilities } from "./capabilities";
import { chatMentionToken } from "./chat-body";
import {
  CHAT_IMAGE_THUMB_HEIGHT,
  chatThumbnailWidth,
} from "./chat-image-geometry";
import {
  chatSendIsEmpty,
  fanOutChatSend,
  stageChatImages,
  type ChatSendDraft,
  type StagedChatImage,
} from "./composer-staging";
import { ChatReplyStrip } from "./ChatReply";
import { readStagedChatImages } from "./stage-files";
import type { ChatAccount, ChatMessage } from "./types";

/** How far back from the caret a `@` can start a mention. */
const MENTION_PATTERN = /@([^\s@]{0,32})$/;

/**
 * The composer: one box holding the reply being answered, the pictures waiting
 * to go, and the words.
 *
 * **The queue stages and Send fans out.** Paste, drag-and-drop and the picker
 * all land in one queue; Send turns it into one image-only message per picture
 * plus one text message. What the box shows is therefore exactly what is about
 * to be sent, which is what makes the ✕ on a thumbnail mean something.
 *
 * **Locked replaces the field, not the panel.** A member a moderator has locked
 * out of chat keeps reading — that is the whole design of the control — so the
 * composer says so in place of the keyboard and the log above is untouched.
 *
 * **Everything that grows here grows downward from a fixed log.** The reply
 * strip, the thumbnail row and the refusal line all appear inside this box, and
 * the box sits under a log whose height never changes, so nothing a reader is
 * reading moves when one of them arrives.
 */
export function ChatComposer({
  capabilities,
  accounts,
  replyingTo,
  replyingToSender,
  onCancelReply,
  onSend,
  className,
}: {
  capabilities: ChatComposerCapabilities;
  /** Everyone mentionable, in the order the suggestion list offers them. */
  accounts: readonly ChatAccount[];
  replyingTo: ChatMessage | null;
  replyingToSender: ChatAccount | null;
  onCancelReply: () => void;
  onSend: (drafts: ChatSendDraft[]) => void;
  className?: string;
}) {
  const t = useTranslations("chat.composer");

  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState("");
  const [staged, setStaged] = useState<StagedChatImage[]>([]);
  const [refused, setRefused] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const stage = async (files: readonly File[]) => {
    if (!capabilities.canAttachImages || files.length === 0) return;
    const incoming = await readStagedChatImages(files);
    setStaged((current) => {
      const result = stageChatImages(current, incoming);
      setRefused(result.refused);
      return result.staged;
    });
  };

  const submit = () => {
    const drafts = fanOutChatSend(text, staged);
    if (drafts.length === 0) return;
    onSend(drafts);
    setText("");
    setStaged([]);
    setRefused(0);
    setMentionQuery(null);
  };

  const updateText = (next: string, caret: number) => {
    setText(next);
    setRefused(0);
    const match = MENTION_PATTERN.exec(next.slice(0, caret));
    setMentionQuery(match === null ? null : match[1].toLowerCase());
  };

  const insertMention = (account: ChatAccount) => {
    const field = fieldRef.current;
    const caret = field?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(MENTION_PATTERN, "");
    const next = `${before}${chatMentionToken(account)} ${text.slice(caret)}`;
    setText(next);
    setMentionQuery(null);
    field?.focus();
  };

  const suggestions =
    mentionQuery === null
      ? []
      : accounts
          .filter((account) =>
            account.name.toLowerCase().startsWith(mentionQuery),
          )
          .slice(0, 5);

  if (capabilities.showsLockNotice) {
    return (
      <div
        className={cn(
          "flex items-start gap-2 rounded-md border border-border bg-muted/60 px-3 py-2 text-sm text-muted-foreground",
          className,
        )}
      >
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>{t("lockNotice")}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-background transition-colors",
        dragging && "border-primary bg-primary/5",
        className,
      )}
      onDragOver={(event) => {
        // Always accepted at the event level: an unhandled drop makes the
        // browser navigate the tab to the file and take the room with it.
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void stage([...event.dataTransfer.files]);
      }}
    >
      {replyingTo !== null && (
        <ChatReplyStrip
          message={replyingTo}
          sender={replyingToSender}
          onCancel={onCancelReply}
        />
      )}

      {staged.length > 0 && (
        <ul aria-label={t("staged")} className="flex flex-wrap gap-1.5 p-2 pb-0">
          {staged.map((image) => (
            <li key={image.key} className="relative shrink-0">
              <Image
                src={image.src}
                alt=""
                width={chatThumbnailWidth(image.width, image.height)}
                height={CHAT_IMAGE_THUMB_HEIGHT}
                unoptimized
                style={{ height: CHAT_IMAGE_THUMB_HEIGHT }}
                className="w-auto rounded border border-border bg-muted object-contain"
              />
              <button
                type="button"
                aria-label={t("removeImage", { name: image.name })}
                onClick={() => {
                  URL.revokeObjectURL(image.src);
                  setStaged((current) =>
                    current.filter((entry) => entry.key !== image.key),
                  );
                  setRefused(0);
                }}
                className="absolute right-1 top-1 rounded-full bg-background/85 p-0.5 text-foreground shadow-sm transition-colors hover:bg-background"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 && (
        <ul
          aria-label={t("mentionList")}
          className="m-2 mb-0 overflow-hidden rounded border border-border bg-popover"
        >
          {suggestions.map((account) => (
            <li key={account.id}>
              <button
                type="button"
                onClick={() => insertMention(account)}
                className="flex w-full items-center px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
              >
                {account.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex items-end gap-1 p-2"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void stage([...(event.target.files ?? [])]);
            // Cleared so picking the same file twice in a row still fires.
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label={t("addImage")}
          disabled={
            !capabilities.canAttachImages ||
            staged.length >= MAX_STAGED_CHAT_IMAGES
          }
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" aria-hidden />
        </Button>

        <Textarea
          ref={fieldRef}
          value={text}
          rows={1}
          maxLength={MAX_CHAT_MESSAGE_LENGTH}
          placeholder={t("placeholder")}
          aria-label={t("label")}
          disabled={!capabilities.canSend}
          onChange={(event) =>
            updateText(event.target.value, event.target.selectionStart)
          }
          onPaste={(event) => {
            const files = [...event.clipboardData.files];
            if (files.length === 0) return;
            event.preventDefault();
            void stage(files);
          }}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter starts a line — the chat convention, and
            // the reason this is a textarea rather than an input at all.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          className="min-h-9 resize-none py-1.5 text-sm"
        />

        <Button
          type="submit"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label={t("send")}
          disabled={!capabilities.canSend || chatSendIsEmpty(text, staged)}
        >
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </form>

      {refused > 0 && (
        <p className="px-2 pb-2 text-xs text-destructive">
          {t("imagesRefused", { count: MAX_STAGED_CHAT_IMAGES })}
        </p>
      )}
    </div>
  );
}
