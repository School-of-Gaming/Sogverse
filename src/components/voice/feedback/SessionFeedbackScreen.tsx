"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cva } from "class-variance-authority";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  SESSION_FEEDBACK_RATINGS,
  SESSION_FEEDBACK_RATING_KEYS,
  type SessionFeedbackRating,
  type SessionFeedbackResult,
} from "./session-feedback-items";

/**
 * One statement and the word that answers it.
 *
 * The key is the stable identifier the answer is reported under and the label is
 * the sentence a gamer reads — two fields rather than one, because the copy is
 * rewritten freely and an answer keyed to a sentence would not survive the first
 * rewrite.
 */
export interface SessionFeedbackItem {
  key: string;
  label: string;
}

export interface SessionFeedbackScreenProps {
  /** The statements, in the order they are asked. */
  items: readonly SessionFeedbackItem[];
  /**
   * What the reader answered, handed over when they press Done.
   *
   * **The screen does not know whether anything is saved.** It collects, it
   * reports once, and what the caller does with the result — store it, ignore
   * it, navigate — is the caller's business, which is what lets the same screen
   * render in a preview scene with nothing behind it.
   */
  onDone: (result: SessionFeedbackResult) => void;
  /**
   * Whether the caller is acting on a Done that has already been pressed.
   *
   * Owned by the caller, not by this screen: the flag has to outlive the screen
   * on the path where pressing Done unloads the document, so it is set
   * synchronously in `onDone` and never cleared there.
   */
  committing: boolean;
  /**
   * A line above the heading — the one place the session's own end is announced,
   * where the screen arrives because the room closed rather than because the
   * reader left it.
   */
  lead?: string;
}

/**
 * One point on the answer row.
 *
 * A chosen point is marked by its own edge, which is the selected state the rest
 * of the app already uses for a bordered target; no fill, no colour of its own,
 * and no element hue — this screen says nothing about which Yty-Element a
 * statement belongs to. The border colour lives in the variant rather than in
 * the base string so the two values can never both be emitted and resolve by
 * stylesheet order.
 */
const answerVariants = cva(
  "flex min-h-9 items-center justify-center rounded-md border px-1 text-center text-[11px] font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      selected: {
        true: "border-act text-foreground",
        false: "border-border text-muted-foreground hover:bg-hover hover:text-foreground",
      },
    },
    defaultVariants: { selected: false },
  },
);

/**
 * **The screen a gamer meets when they leave an online session.**
 *
 * Seven statements on one five-point row, an optional note and a Done, sized so
 * the whole question fits a phone without scrolling — a child scrolling to find
 * out how much is left is a child who stops answering halfway.
 *
 * Purely presentational: the statements arrive as data, the answers leave
 * through one callback, and nothing here reaches a service, a route or a store.
 * Every item is optional and an unanswered one is a skip, which is why there is
 * no Skip button and why Done is never disabled for want of an answer.
 */
export function SessionFeedbackScreen({
  items,
  onDone,
  committing,
  lead,
}: SessionFeedbackScreenProps) {
  const t = useTranslations("voice.feedback");
  const groupId = useId();
  const noteFieldId = `${groupId}-note`;

  const [answers, setAnswers] = useState<
    Record<string, SessionFeedbackRating | undefined>
  >({});
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Opening the field is the reader asking for it, so the caret belongs in it —
  // otherwise the tap costs a second tap to start writing.
  useEffect(() => {
    if (noteOpen) noteRef.current?.focus();
  }, [noteOpen]);

  const handleDone = useCallback(() => {
    // Every statement is reported, answered or not: absence of a key and an
    // undefined answer mean the same thing to a reader of the result, and one
    // shape is easier to hold than two.
    const reported: Record<string, SessionFeedbackRating | undefined> = {};
    for (const item of items) reported[item.key] = answers[item.key];
    onDone({ answers: reported, note });
  }, [answers, items, note, onDone]);

  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        {lead !== undefined && (
          <p className="text-xs text-muted-foreground">{lead}</p>
        )}
        <h1 className="text-lg font-semibold">{t("heading")}</h1>

        <div className="space-y-2">
          {items.map((item) => {
            const labelId = `${groupId}-${item.key}`;
            return (
              <div key={item.key}>
                <p id={labelId} className="text-sm leading-snug">
                  {item.label}
                </p>
                <div
                  role="radiogroup"
                  aria-labelledby={labelId}
                  className="mt-1 grid grid-cols-5 gap-1"
                >
                  {SESSION_FEEDBACK_RATINGS.map((rating) => {
                    const selected = answers[item.key] === rating;
                    return (
                      <button
                        key={rating}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={committing}
                        onClick={() =>
                          setAnswers((current) => ({
                            ...current,
                            [item.key]: rating,
                          }))
                        }
                        className={answerVariants({ selected })}
                      >
                        {t(`scale.${SESSION_FEEDBACK_RATING_KEYS[rating]}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Collapsed to one line until it is asked for: a textarea standing open
            under seven questions reads as an eighth question, and most readers
            have nothing to add. Expanding is the reader's own action, so the
            growth below them is theirs to expect. */}
        {noteOpen ? (
          <div>
            <label htmlFor={noteFieldId} className="sr-only">
              {t("notePrompt")}
            </label>
            <Textarea
              id={noteFieldId}
              ref={noteRef}
              rows={3}
              value={note}
              disabled={committing}
              placeholder={t("notePrompt")}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        ) : (
          <button
            type="button"
            disabled={committing}
            onClick={() => setNoteOpen(true)}
            className={cn(
              "flex min-h-9 w-full items-center rounded-md border border-border px-3 text-left text-sm text-muted-foreground transition-colors",
              "hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            {t("notePrompt")}
          </button>
        )}

        <p className="text-xs text-muted-foreground">{t("audience")}</p>

        <Button type="button" className="w-full" disabled={committing} onClick={handleDone}>
          {t("done")}
        </Button>
      </CardContent>
    </Card>
  );
}
