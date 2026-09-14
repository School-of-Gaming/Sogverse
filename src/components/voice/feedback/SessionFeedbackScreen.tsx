"use client";

import { useCallback, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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
 * One of the five segments of a statement's charge bar: the block drawn by the
 * sibling of a hidden native radio.
 *
 * The radio is real, and that is the whole reason the markup is shaped this way:
 * a row is then one tab stop whose arrow keys walk the five levels, instead of
 * five tab stops a child has to press Tab through thirty-five times. Each radio
 * keeps a name of its own, read by assistive tech and never drawn, so the bar is
 * still five named options rather than a picture of a value.
 *
 * The segment is `h-11` because it is a thumb target, and the gap between
 * segments is what makes the bar read as five rather than as one trough — a bar
 * a child cannot count the steps of is a slider, and a slider is the control
 * this one exists instead of.
 *
 * The fill transition is the charge: tapping the fourth segment lights four of
 * them, and a colour transition is what makes that look like the bar filling
 * rather than the page repainting. It is `motion-safe:` only, so a reader who
 * has asked for no animation gets the new level immediately.
 */
const SEGMENT =
  "block h-11 w-full rounded-sm motion-safe:transition-colors motion-safe:duration-200 peer-hover:bg-hover peer-focus-visible:ring-2 peer-focus-visible:ring-act peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-disabled:opacity-50";

/**
 * **The screen a gamer meets when they leave an online session.**
 *
 * Seven statements, each answered on a charge bar, a note and a Done, read as
 * one column from the top down. It is longer than a phone viewport and that is
 * the design: a child answering seven questions is better served by text they
 * can read and targets they can hit than by a screen squeezed until it fits.
 *
 * **The answer control is a five-segment bar that charges.** Tapping a segment
 * fills it and everything below it, tapping a lower one drains back to it, and
 * the level's word is shown once beside the bar rather than five times under it
 * — five words competing for a phone's width read as a list to choose from, and
 * this is one value to set. **Tapping the segment the fill already ends on
 * empties the bar**, which is the only way back to unanswered and has to exist:
 * every statement is a skip until it is touched, and a child who taps one by
 * accident would otherwise be unable to take it back. The line holding the word
 * is always reserved, so answering — and un-answering — shifts nothing below it.
 *
 * **Choosing an answer changes that bar and nothing else.** The page does not
 * move: a reader has to be able to see the level they just set, and a screen
 * that scrolls away from the tap takes the answer out from under them before
 * they can check it.
 *
 * On a phone the column is not carded — width is the scarce resource there, and
 * a card would spend some of it on padding and a border the bar needs more than
 * the page needs the frame. From `sm` up the same column takes the card, capped
 * to the narrow centred width a focused single-question page uses.
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
  const [note, setNote] = useState("");

  /**
   * Set a statement's level, or clear it when the tap lands on the level it is
   * already at.
   *
   * Clearing is why this reads the click rather than only the change: a radio
   * that is already checked fires no change event, so the second tap would
   * otherwise be swallowed by the control that was supposed to answer it.
   */
  const choose = useCallback((key: K, rating: SessionFeedbackRating) => {
    setAnswers((current) => ({
      ...current,
      [key]: current[key] === rating ? undefined : rating,
    }));
  }, []);

  const handleDone = useCallback(() => {
    // Every statement is reported, answered or not: absence of a key and an
    // undefined answer mean the same thing to a reader of the result, and one
    // shape is easier to hold than two.
    const reported: Record<string, SessionFeedbackRating | undefined> = {};
    for (const item of items) reported[item.key] = answers[item.key];
    onDone({ answers: reported, note });
  }, [answers, items, note, onDone]);

  return (
    // No card below `sm`: the page's own gutter is the only margin, so the bar
    // spans the full content width. From `sm` the card appears and the column is
    // capped at the width the app gives a single-question page — the auth cards'
    // `max-w-md` — so a wide screen centres the same column instead of
    // stretching it.
    <div className="mx-auto w-full max-w-md space-y-6 sm:rounded-lg sm:border sm:border-border sm:bg-card sm:p-6 sm:shadow-sm">
      {/* Centred, at the size and alignment the app's other single-question
          cards give their title — this column borrows their width, so it
          borrows how the question is set at the top of it. Everything below
          the title stays left-aligned: statements are read, not announced. */}
      <div className="space-y-1 text-center">
        {lead !== undefined && (
          <p className="text-sm text-muted-foreground">{lead}</p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("heading")}
        </h1>
      </div>

      {/* The rhythm between statements is the app's section gap, not a squeeze:
          each statement and its bar read as one block with clear air around it,
          which is what lets a reader answer a bar without checking which
          sentence it belongs to. */}
      <div className="space-y-6">
        {items.map((item) => {
          const labelId = `${groupId}-${item.key}`;
          // Named with its own type rather than left as the generic map's
          // lookup, so narrowing it below reaches the message key.
          const level: SessionFeedbackRating | undefined = answers[item.key];
          return (
            <div key={item.key}>
              <p id={labelId} className="text-base leading-snug">
                {item.label}
              </p>
              {/* Rounded at the bar's own ends only, so five segments read as
                  one meter with a level rather than as five buttons. */}
              <div
                role="radiogroup"
                aria-labelledby={labelId}
                className="mt-2 flex gap-1 overflow-hidden rounded-lg"
              >
                {SESSION_FEEDBACK_RATINGS.map((rating) => (
                  <label key={rating} className="flex-1 cursor-pointer">
                    {/* One `name` per statement: the arrows walk this bar and
                        Tab leaves it for the next one. It carries the
                        instance id too, because two screens on one document
                        sharing a name would deselect each other. */}
                    <input
                      type="radio"
                      name={`${groupId}-${item.key}`}
                      value={rating}
                      className="peer sr-only"
                      checked={level === rating}
                      disabled={committing}
                      // A radio that is already checked fires no change event,
                      // so the tap that empties the bar is read from the click
                      // and the tap that sets a new level from the change. The
                      // two never fire for the same tap, and the click reads
                      // the level from before this render either way.
                      onClick={() => {
                        if (level === rating) choose(item.key, rating);
                      }}
                      onChange={() => choose(item.key, rating)}
                    />
                    {/* The word is the radio's name for anyone who cannot see
                        the bar: five levels, each said in the same word the
                        line under the bar shows. */}
                    <span className="sr-only">
                      {t(`scale.${SESSION_FEEDBACK_RATING_KEYS[rating]}`)}
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        SEGMENT,
                        // Filled from the state, not from `peer-checked`: only
                        // one radio in a bar is checked, and every segment below
                        // it has to fill too.
                        level !== undefined && rating <= level
                          ? "bg-act"
                          : "bg-lifted",
                      )}
                    />
                  </label>
                ))}
              </div>
              {/* Always here, empty or not: the word arrives — and leaves
                  again when the bar is emptied — where a line is already
                  reserved for it, so neither move shifts the page. */}
              <p className="mt-1.5 min-h-4 text-right text-xs font-medium leading-4 text-foreground">
                {level !== undefined &&
                  t(`scale.${SESSION_FEEDBACK_RATING_KEYS[level]}`)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Open from the start: it is the one place the screen lets a reader say
          something in their own words, and a field they have to ask for is a
          field most readers never find. */}
      <div>
        <label htmlFor={noteFieldId} className="sr-only">
          {t("notePrompt")}
        </label>
        <Textarea
          id={noteFieldId}
          rows={3}
          value={note}
          disabled={committing}
          placeholder={t("notePrompt")}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

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
