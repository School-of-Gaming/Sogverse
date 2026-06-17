"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { MAX_MESSAGE_LENGTH } from "./hooks/use-chat";

/**
 * Ephemeral in-call chat, rendered between the voice room card and the
 * participant list. The message log is a fixed-height scroll area so incoming
 * messages stay contained — they never push the participant list below it out
 * from under the user (the no-reflow rule in CLAUDE.md § Layout & Scrolling).
 */
export function ChatPanel() {
  const { messages, sendChatMessage, joined } = useVoiceRoom();
  const t = useTranslations("voice.chat");
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  // Whether the log is scrolled to (or within a line of) the bottom. Updated on
  // every user scroll; the auto-stick effect reads it so a reader who scrolled
  // up to revisit history keeps their position as new messages arrive, and only
  // resumes following once they scroll back to the bottom themselves.
  const atBottomRef = useRef(true);

  const handleScroll = () => {
    const el = logRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  // Keep the newest message in view, but only when already at the bottom — never
  // yank a user back down mid-scroll. Setting scrollTop on the log itself (vs.
  // scrollIntoView) confines the scroll to this box and never moves the page.
  useEffect(() => {
    const el = logRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    sendChatMessage(text);
    setDraft("");
  };

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div ref={logRef} onScroll={handleScroll} className="h-48 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            messages.map((m, i) => {
              // Group a run of consecutive messages from the same sender under
              // one name header (Discord/Slack style): the name shows only on
              // the first message of each run, and the run sits tighter together
              // (mt-0.5) with a larger gap (mt-2) starting a new sender's block.
              const grouped = i > 0 && messages[i - 1].senderId === m.senderId;
              return (
                <div key={m.id} className={cn("flex flex-col", grouped ? "mt-0.5" : "mt-2 first:mt-0")}>
                  {/* The name is the only wayfinding cue in the grouped layout
                      (no column, not repeated within a run), so it's the
                      strongest text on the line: primary color + bold. Every
                      name uses the brand color — the name text itself identifies
                      the sender, so it needn't also encode self. */}
                  {!grouped && (
                    <span className="text-sm font-semibold text-primary">{m.userName}</span>
                  )}
                  <span className="break-words text-sm leading-snug text-foreground">{m.text}</span>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("placeholder")}
            maxLength={MAX_MESSAGE_LENGTH}
            disabled={!joined}
            aria-label={t("title")}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!joined || draft.trim().length === 0}
            className="gap-1.5"
          >
            <Send className="h-4 w-4" />
            {t("send")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
