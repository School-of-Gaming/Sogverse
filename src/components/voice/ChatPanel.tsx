"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVoiceRoom } from "./VoiceRoomProvider";

const MAX_MESSAGE_LENGTH = 500;

// TEMP DEMO — hardcoded messages to preview how varying name lengths look in
// the gutter. Rendered directly so they show without joining. REMOVE before committing.
const FAKE_MESSAGES = [
  { id: "d1", userName: "Sofia", text: "Welcome back, builders! Today we're building the village marketplace 🏘️", isLocal: false },
  { id: "d2", userName: "Leo", text: "can we add a pumpkin farm??", isLocal: false },
  { id: "d3", userName: "Sofia", text: "Love it Leo — who wants to lead the farm crew?", isLocal: false },
  { id: "d4", userName: "Emilia", text: "me!! I'll plant the pumpkins", isLocal: true },
  { id: "d5", userName: "Aleksanteri", text: "I'll gather wood for the stalls", isLocal: false },
  { id: "d6", userName: "EnderQueen", text: "where do we all spawn?", isLocal: false },
  { id: "d7", userName: "Sofia", text: "Meet me at the fountain in the center. Let's go team! 🛠️", isLocal: false },
];

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

  // Keep the newest message in view. Setting scrollTop on the log itself (vs.
  // scrollIntoView) confines the scroll to this box and never moves the page.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
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
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={logRef} className="h-48 space-y-1.5 overflow-y-auto pr-1">
          {/* TEMP DEMO — rendering FAKE_MESSAGES instead of `messages`. */}
          {FAKE_MESSAGES.map((m) => (
            <div key={m.id} className="flex gap-2 text-sm leading-snug">
              <span
                title={m.userName}
                className={cn(
                  "w-20 shrink-0 truncate font-medium",
                  m.isLocal ? "text-primary" : "text-muted-foreground",
                )}
              >
                {m.userName}
              </span>
              <span className="min-w-0 flex-1 break-words text-foreground">{m.text}</span>
            </div>
          ))}
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
