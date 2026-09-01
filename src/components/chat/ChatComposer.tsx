"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { resolveChatMentions } from "./chat-body";
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
 * **Everything that grows here grows downward from a fixed log.** The
 * thumbnail row and the refusal line appear inside this box, and the box sits
 * under a log whose height never changes, so nothing a reader is reading moves
 * when one of them arrives. (The reply strip is not here for the same reason:
 * it lives at the bottom of the log's fixed column, borrowing its height from
 * the log, so starting a reply cannot resize the surface either.)
 *
 * **The mention list is the one thing that does not grow the box at all**: it
 * floats above it, overlaying the bottom of the log. In flow it resized the
 * whole chat surface on every keystroke after an `@` — and a surface that
 * changes height while somebody types is the same defect as one that changes
 * height while somebody reads, arriving from the other end.
 */
export function ChatComposer({
  capabilities,
  accounts,
  replyingTo,
  onSend,
  className,
}: {
  capabilities: ChatComposerCapabilities;
  /** Everyone mentionable, in the order the suggestion list offers them. */
  accounts: readonly ChatAccount[];
  /** The message being answered — the strip itself is the view's to draw. */
  replyingTo: ChatMessage | null;
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
  const [mentionIndex, setMentionIndex] = useState(0);

  // The queue, readable synchronously. Staging is asynchronous — the files are
  // decoded before they can join — so the value captured when `stage` was
  // called is a render old by the time it lands, and two drops in quick
  // succession would have the second overwrite the first.
  const stagedRef = useRef(staged);
  const commitStaged = (next: StagedChatImage[]) => {
    stagedRef.current = next;
    setStaged(next);
  };

  // Where the caret has to be once React has committed a value this component
  // rewrote — after a mention is inserted, that is just past the token, not
  // wherever a controlled re-render would leave it.
  const caretRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const caret = caretRef.current;
    if (caret === null) return;
    caretRef.current = null;
    const field = fieldRef.current;
    if (field === null) return;
    field.focus();
    field.setSelectionRange(caret, caret);
  });

  // Choosing a reply target is choosing to write: pressing Reply — on this
  // message or a different one mid-strip — puts the caret in the field so the
  // hand goes straight from click to typing. Keyed on the id so re-renders
  // with the same target do not steal focus from wherever the user took it.
  const replyTargetId = replyingTo?.id ?? null;
  useEffect(() => {
    if (replyTargetId === null) return;
    fieldRef.current?.focus();
  }, [replyTargetId]);

  const stage = async (files: readonly File[]) => {
    if (!capabilities.canAttachImages || files.length === 0) return;
    const incoming = await readStagedChatImages(files);
    const result = stageChatImages(stagedRef.current, incoming);
    // The refused tail never becomes a message, so nothing downstream will ever
    // take its object URLs over — the sent ones hand that ownership to the
    // message, these have nobody to hand it to and are released here.
    if (result.refused > 0) {
      for (const image of incoming.slice(incoming.length - result.refused)) {
        URL.revokeObjectURL(image.src);
      }
    }
    commitStaged(result.staged);
    setRefused(result.refused);
  };

  const submit = () => {
    // The one place the display form becomes the stored one. Everything above
    // this line — the field, the cap, the suggestion list, the caret — works in
    // `@Name`; everything below it works in `@[Name](id)`.
    const body = resolveChatMentions(text, accounts);
    const drafts = fanOutChatSend(body, staged, replyingTo?.id ?? null);
    if (drafts.length === 0) return;
    onSend(drafts);
    setText("");
    commitStaged([]);
    setRefused(0);
    setMentionQuery(null);
  };

  const updateText = (next: string, caret: number) => {
    setText(next);
    setRefused(0);
    const match = MENTION_PATTERN.exec(next.slice(0, caret));
    setMentionQuery(match === null ? null : match[1].toLowerCase());
    setMentionIndex(0);
  };

  /**
   * Picking a name writes `@Name ` — what the sentence reads as, never the
   * stored token *(owner ruling)*. A writer watching `@[Aino](3f2b…)` appear in
   * their own half-finished sentence is watching the plumbing, and the cap
   * counts characters they cannot see. The token is put back at send, over the
   * whole draft, so a name typed by hand and a name picked from this list end
   * up identical — which is also why the trailing space matters: it ends the
   * name, closes the suggestion list, and is where the sentence carries on.
   */
  const insertMention = (account: ChatAccount) => {
    const field = fieldRef.current;
    const caret = field?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(MENTION_PATTERN, "");
    const token = `@${account.name} `;
    setText(`${before}${token}${text.slice(caret)}`);
    setMentionQuery(null);
    setMentionIndex(0);
    caretRef.current = before.length + token.length;
  };

  const suggestions =
    mentionQuery === null
      ? []
      : accounts
          .filter((account) =>
            account.name.toLowerCase().startsWith(mentionQuery),
          )
          .slice(0, 5);

  // Clamped rather than reset: a list that shortens under the highlight — one
  // more character typed — must not silently point past its own end.
  const activeIndex =
    suggestions.length === 0 ? 0 : Math.min(mentionIndex, suggestions.length - 1);

  // A depth count rather than a boolean, because `dragleave` fires every time
  // the pointer crosses into a child of this box — the thumbnails, the field,
  // the buttons — and a naive handler flickers the highlight off on each one.
  const dragDepth = useRef(0);

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
        // `relative` is what the mention list hangs off: it floats above this
        // box rather than sitting inside it, so the composer's own height
        // never depends on whether somebody is halfway through a name.
        "relative rounded-md border border-border bg-background transition-colors",
        dragging && "border-primary bg-primary/5",
        className,
      )}
      onDragEnter={() => {
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        // Always accepted at the event level: an unhandled drop makes the
        // browser navigate the tab to the file and take the room with it.
        event.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        void stage([...event.dataTransfer.files]);
      }}
    >
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
                  commitStaged(
                    stagedRef.current.filter((entry) => entry.key !== image.key),
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

      {/* **Floated over the log, never in flow.** An in-flow list grew the
          composer as somebody typed `@`, which pushed nothing below it (there
          is nothing below it) but changed the height of the whole surface —
          the same thing the fixed-height log and the reply strip's borrowed
          height exist to prevent, arriving from the other end. Anchored to the
          top of this box it overlays the log's last line or two: content a
          reader is not looking at, because they are typing, and it is gone the
          moment the name is picked. Above the log's own absolutely-positioned
          children (the unread pill) by z-index rather than by DOM order, so
          neither can be reordered into covering the other. */}
      {suggestions.length > 0 && (
        <ul
          aria-label={t("mentionList")}
          className="absolute inset-x-0 bottom-full z-20 mb-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
        >
          {suggestions.map((account, index) => (
            <li key={account.id}>
              <button
                type="button"
                // The pointer takes the highlight with it, so a reader who
                // reaches for the mouse mid-list and then goes back to Enter
                // sends the one under their hand rather than the one the arrow
                // keys were last on.
                onMouseMove={() => setMentionIndex(index)}
                onClick={() => insertMention(account)}
                className={cn(
                  "flex w-full items-center px-2 py-1.5 text-left text-sm transition-colors",
                  index === activeIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent",
                )}
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
            // While the suggestion list is open the arrows, Enter and Tab
            // belong to it: a reader picking a name has their hands on exactly
            // those keys, and Enter sending the half-typed `@ai` instead of
            // naming Aino is the whole reason this branch is first.
            if (suggestions.length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setMentionIndex((activeIndex + 1) % suggestions.length);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setMentionIndex(
                  (activeIndex - 1 + suggestions.length) % suggestions.length,
                );
                return;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                insertMention(suggestions[activeIndex]);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setMentionQuery(null);
                return;
              }
            }
            // Enter sends, Shift+Enter starts a line — the chat convention, and
            // the reason this is a textarea rather than an input at all.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          // `text-base` is inherited deliberately: a sub-16px field makes iOS
          // Safari auto-zoom the page on focus. The density the row wants comes
          // out of the padding and the line box instead.
          className="min-h-9 resize-none py-1.5 leading-6"
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
