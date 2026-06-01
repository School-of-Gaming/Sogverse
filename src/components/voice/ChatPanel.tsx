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
          {messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            messages.map((m) => (
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
            ))
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
