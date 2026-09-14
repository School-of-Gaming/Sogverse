"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
  "flex min-h-11 w-full min-w-0 items-center justify-center hyphens-auto break-words rounded-md border border-border px-0.5 py-1.5 text-center text-xs sm:px-1 font-medium leading-tight text-muted-foreground transition-colors peer-hover:bg-hover peer-hover:text-foreground peer-checked:border-act peer-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-act peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-disabled:opacity-50";

/**
 * **The screen a gamer meets when they leave an online session.**
 *
 * Seven statements on one five-point row, an optional note and a Done, read as
 * one column from the top down. It is longer than a phone viewport and that is
 * the design: a child answering seven questions is better served by text they
 * can read and targets they can hit than by a screen squeezed until it fits.
 *
 * On a phone the column is not carded — width is the scarce resource there, and
 * a card would spend some of it on padding and a border the five answer cells
 * need more than the page needs the frame. From `sm` up the same column takes
 * the card, capped to the narrow centred width a focused single-question page
 * uses, so the cells never stretch across a desktop.
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
    // No card below `sm`: the page's own gutter is the only margin, so all five
    // cells share the full content width. From `sm` the card appears and the
    // column is capped at the width the app gives a single-question page — the
    // auth cards' `max-w-md` — so a wide screen centres the same column instead
    // of stretching it.
    <div className="mx-auto w-full max-w-md space-y-6 sm:rounded-lg sm:border sm:border-border sm:bg-card sm:p-6 sm:shadow-sm">
      <div className="space-y-1">
        {lead !== undefined && (
          <p className="text-sm text-muted-foreground">{lead}</p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("heading")}
        </h1>
      </div>

      {/* The rhythm between statements is the app's section gap, not a squeeze:
          each statement and its row read as one block with clear air around it,
          which is what lets a reader answer a row without checking which
          sentence it belongs to. */}
      <div className="space-y-6">
        {items.map((item) => {
          const labelId = `${groupId}-${item.key}`;
          return (
            <div key={item.key}>
              <p id={labelId} className="text-base leading-snug">
                {item.label}
              </p>
              <div
                role="radiogroup"
                aria-labelledby={labelId}
                className="mt-2 grid grid-cols-5 gap-1.5 sm:gap-2"
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
          size="lg"
          // The prompt is a sentence, so the line wraps and the button grows to
          // hold it: a button's default single line would push its own words
          // past the page at the design floor, which is a horizontal scroll on
          // the whole document rather than a clipped label.
          className="h-auto min-h-11 w-full justify-start whitespace-normal px-4 py-2 text-left font-normal text-muted-foreground"
          disabled={committing}
          onClick={() => setNoteOpen(true)}
        >
          {t("notePrompt")}
        </Button>
      )}

      <p className="text-sm text-muted-foreground">{t("audience")}</p>

      {/* Done ends the column, where a reader who has answered their way down
          the page arrives at it. It is not pinned to the viewport: the
          dashboard layout scrolls the document itself and holds nothing over
          it but the header. */}
      <Button
        type="button"
        size="lg"
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
    </div>
  );
}
