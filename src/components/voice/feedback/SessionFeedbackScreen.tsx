"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  SESSION_FEEDBACK_RATINGS,
  SESSION_FEEDBACK_RATING_KEYS,
  type SessionFeedbackItemKey,
  type SessionFeedbackRating,
  type SessionFeedbackResult,
} from "./session-feedback-items";

/**
 * One statement and the word that answers it.
 *
 * The key is the stable identifier the answer is reported under and the label is
 * the sentence a gamer reads — two fields rather than one, because the copy is
 * rewritten freely and an answer keyed to a sentence would not survive the first
 * rewrite. The key is the catalogue's own type, so a caller cannot ask — or
 * report — a statement the catalogue does not know.
 */
export interface SessionFeedbackItem<
  K extends SessionFeedbackItemKey = SessionFeedbackItemKey,
> {
  key: K;
  label: string;
}

export interface SessionFeedbackScreenProps<
  K extends SessionFeedbackItemKey = SessionFeedbackItemKey,
> {
  /** The statements, in the order they are asked. */
  items: readonly SessionFeedbackItem<K>[];
  /**
   * What the reader answered, handed over when they press Done.
   *
   * **The screen does not know whether anything is saved.** It collects, it
   * reports once, and what the caller does with the result — store it, ignore
   * it, navigate — is the caller's business, which is what lets the same screen
   * render in a preview scene with nothing behind it.
   */
  onDone: (result: SessionFeedbackResult<K>) => void;
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
 * One point on the answer row: the cell drawn by the sibling of a hidden native
 * radio.
 *
 * The radio is real, and that is the whole reason the markup is shaped this way:
 * a row is then one tab stop whose arrow keys walk the five words, instead of
 * five tab stops a child has to press Tab through thirty-five times. It is the
 * construct the app's other radio groups already use, with the control hidden
 * rather than drawn because the cell itself is the target here.
 *
 * A chosen point is marked by its own edge — the selected state the rest of the
 * app uses for a bordered target — and the mark is the `peer-checked:` answer to
 * the input's own state rather than a class picked in JavaScript, so there is
 * one source of which word is chosen. No fill, no colour of its own, and no
 * element hue: this screen says nothing about which Yty-Element a statement
 * belongs to.
 *
 * `min-w-0` plus wrapping is what makes the cell safe in every locale. Five
 * cells share a phone's width, so a word that will not fit on one line takes a
 * second, and a word with nowhere to break is broken rather than painted across
 * its neighbour.
 */
const ANSWER_CELL =
  "flex min-h-9 w-full min-w-0 items-center justify-center hyphens-auto break-words rounded-md border border-border px-0.5 text-center text-[11px] font-medium leading-tight text-muted-foreground transition-colors peer-hover:bg-hover peer-hover:text-foreground peer-checked:border-act peer-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-act peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-disabled:opacity-50";

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
export function SessionFeedbackScreen<
  K extends SessionFeedbackItemKey = SessionFeedbackItemKey,
>({ items, onDone, committing, lead }: SessionFeedbackScreenProps<K>) {
  const t = useTranslations("voice.feedback");
  const groupId = useId();
  const noteFieldId = `${groupId}-note`;

  const [answers, setAnswers] = useState<
    Partial<Record<K, SessionFeedbackRating>>
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
      <CardContent className="space-y-2 p-3 sm:p-5">
        {lead !== undefined && (
          <p className="text-xs text-muted-foreground">{lead}</p>
        )}
        <h1 className="text-lg font-semibold">{t("heading")}</h1>

        <div className="space-y-1.5">
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
                  className="mt-0.5 grid grid-cols-5 gap-1"
                >
                  {SESSION_FEEDBACK_RATINGS.map((rating) => (
                    <label key={rating} className="flex min-w-0 cursor-pointer">
                      {/* One `name` per statement: the arrows walk this row and
                          Tab leaves it for the next one. It carries the
                          instance id too, because two screens on one document
                          sharing a name would deselect each other. */}
                      <input
                        type="radio"
                        name={`${groupId}-${item.key}`}
                        value={rating}
                        className="peer sr-only"
                        checked={answers[item.key] === rating}
                        disabled={committing}
                        onChange={() =>
                          setAnswers((current) => ({
                            ...current,
                            [item.key]: rating,
                          }))
                        }
                      />
                      <span className={ANSWER_CELL}>
                        {t(`scale.${SESSION_FEEDBACK_RATING_KEYS[rating]}`)}
                      </span>
                    </label>
                  ))}
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start text-sm font-normal text-muted-foreground"
            disabled={committing}
            onClick={() => setNoteOpen(true)}
          >
            {t("notePrompt")}
          </Button>
        )}

        <p className="text-xs text-muted-foreground">{t("audience")}</p>

        <Button
          type="button"
          className="w-full"
          disabled={committing}
          onClick={handleDone}
        >
          {/* The Done a child pressed has to look pressed for the whole of the
              navigation it starts, which is the app's committing rule: the flag
              is never cleared, so the spinner rides out the unload. */}
          {committing && <Loader2 className="animate-spin" />}
          {t("done")}
        </Button>
      </CardContent>
    </Card>
  );
}
