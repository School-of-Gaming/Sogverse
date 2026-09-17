"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  SESSION_FEEDBACK_NOTE_MAX_LENGTH,
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

/**
 * The answers and the note the form opens with.
 *
 * Only the statements carrying an answer are present — the same shape an answer
 * is stored in, so a caller that has read one back hands it over as it stands
 * rather than re-expanding it into a key per statement.
 */
export interface SessionFeedbackInitialState<
  K extends SessionFeedbackItemKey = SessionFeedbackItemKey,
> {
  answers: Partial<Record<K, SessionFeedbackRating>>;
  note: string;
}

export interface SessionFeedbackScreenProps<
  K extends SessionFeedbackItemKey = SessionFeedbackItemKey,
> {
  /** The statements, in the order they are asked. */
  items: readonly SessionFeedbackItem<K>[];
  /**
   * What the form starts out holding — absent for an empty one, which is the
   * resting state.
   *
   * **Read once, as the screen mounts.** A value arriving or changing after
   * that is ignored, because by then whatever the reader has already tapped is
   * the newer answer and re-seeding would take it back off them. The screen
   * knows no more about where this came from than about where the result goes:
   * a stored row and a fixture are the same argument here.
   */
  initial?: SessionFeedbackInitialState<K>;
  /**
   * What the reader answered, handed over when they press Done.
   *
   * **The screen does not know whether anything is stored — at either end.** It
   * is handed an initial state, it collects, it reports once, and where that
   * state came from and what the caller does with the result — store it, ignore
   * it, navigate — are both the caller's business, which is what lets the same
   * screen render in a preview scene with nothing behind it.
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
  /**
   * A line above Done, in the caller's own already-translated words — the one
   * place the screen says something went wrong with the press the reader just
   * made.
   *
   * The caller owns the sentence exactly as it owns `lead`'s, because only the
   * caller knows what it was doing; the screen renders whatever it is handed,
   * and nothing at all when it is handed nothing, so the column is unchanged
   * for a reader who never meets the case.
   */
  status?: string;
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
 * The gap between segments is what makes the bar read as five rather than as one
 * trough — a bar a child cannot count the steps of is a slider, and a slider is
 * the control this one exists instead of.
 *
 * The blocks **rise** from left to right, bottom-aligned, the way a signal
 * strength meter does: the bar has to say which end is "more" before anything is
 * tapped, and a row of five identical blocks says nothing at all. Height carries
 * that here, and the words at the two ends of the line below carry it in
 * language — twice, because a child reading neither of them has to be able to
 * read the other.
 *
 * The rising blocks are the *drawing*; the **tap target stays 44px on every
 * segment**. The label is the full row height and the block is bottom-aligned
 * inside it, so the short first segment is exactly as easy to hit as the tall
 * last one — a control whose first option is half the target of its last one
 * would quietly bias a seven-year-old's answers upward.
 *
 * The fill transition is the charge: tapping the fourth segment lights four of
 * them, and a colour transition is what makes that look like the bar filling
 * rather than the page repainting. It is `motion-safe:` only, so a reader who
 * has asked for no animation gets the new level immediately.
 */
const SEGMENT =
  "block w-full rounded-sm motion-safe:transition-colors motion-safe:duration-200 peer-hover:bg-hover peer-focus-visible:ring-2 peer-focus-visible:ring-act peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-disabled:opacity-50";

/**
 * How tall each level's block is drawn, from the first to the fifth.
 *
 * Five even steps from just over half the row to the whole of it: enough
 * difference between neighbours to read as a rise at a glance, and the last one
 * is the full 44 so the tallest block and the tap target agree at the end the
 * bar charges toward. Only the drawing changes — every label is 44 tall.
 */
const SEGMENT_HEIGHTS = {
  1: "h-[24px]",
  2: "h-[29px]",
  3: "h-[34px]",
  4: "h-[39px]",
  5: "h-[44px]",
} as const satisfies Record<SessionFeedbackRating, string>;

/**
 * Where a level's word is placed on the line below the bar, and how it is
 * aligned there.
 *
 * The line is the bar's own five columns, so the word can sit **under the
 * segment that was tapped** — a caption that points at the choice rather than a
 * value floating in the middle of a control it no longer describes. The column
 * is the level's own; the alignment is what keeps the word inside the bar: the
 * ends pull in (left at the first, right at the fifth) so a long word grows
 * inward, and the middle three centre under their own segment.
 *
 * A word is routinely wider than a fifth of the bar, and that is allowed —
 * `min-w-max` sizes it to its own content and lets it overflow into the empty
 * columns beside it rather than wrapping or truncating. At the ends that
 * inward growth is the whole reason the word never crosses the bar's outer
 * edges.
 */
const WORD_CELL = {
  1: "col-start-1 justify-self-start text-left",
  2: "col-start-2 justify-self-center text-center",
  3: "col-start-3 justify-self-center text-center",
  4: "col-start-4 justify-self-center text-center",
  5: "col-start-5 justify-self-end text-right",
} as const satisfies Record<SessionFeedbackRating, string>;

/**
 * **The screen a gamer meets when they leave an online session.**
 *
 * Five statements, each answered on a charge bar, a note and a Done, read as
 * one column from the top down. It is longer than a phone viewport and that is
 * the design: a child answering five questions is better served by text they
 * can read and targets they can hit than by a screen squeezed until it fits.
 *
 * **The answer control is a five-segment bar that charges.** Tapping a segment
 * fills it and everything below it, tapping a lower one drains back to it, and
 * the level's word is shown once, on the line below the bar rather than five
 * times under the segments — five words competing for a phone's width read
 * as a list to choose from, and this is one value to set. **Tapping the
 * segment the fill already ends on empties the bar**, which is the only way back
 * to unanswered and has to exist: every statement is a skip until it is touched,
 * and a child who taps one by accident would otherwise be unable to take it
 * back. From the keyboard the same route is Space on the level already chosen —
 * activating the checked radio clears it exactly as a second tap does, and that
 * is how a keyboard reader skips a statement they have already answered. The
 * line holding the word is always reserved, so answering — and un-answering —
 * shifts nothing below it; it is a polite live region, so the level is announced
 * as it is set and as it is cleared.
 *
 * **The bar says which way it runs before anything is tapped, and says it
 * twice.** The blocks rise from left to right like a signal meter, and while a
 * statement is unanswered the line under them carries the first level's word at
 * the left and the fifth's at the right in muted type. A reader who does not
 * read the shape reads the words, and the other way round. Those two are a
 * **prompt, not a caption**: they are there for the moment before an answer and
 * they go the instant one is given, leaving the chosen word alone on the same
 * line — and clearing the bar brings the question's prompts back with the
 * question.
 *
 * **The chosen word sits under the segment that was tapped.** The line is the
 * bar's own five columns, so the caption points at the choice instead of
 * floating in the middle of a control it no longer describes, and the word is
 * pulled in at the two ends — left in the first column, right in the fifth — so
 * a word longer than a fifth of the bar grows inward and never leaves the bar's
 * outer edges. A middle word is centred under its segment and simply overflows
 * into the empty columns beside it; nothing wraps and nothing is truncated. All
 * of it is one row, so the swap costs no height and moves nothing. The end words
 * are
 * `aria-hidden`: assistive tech already hears all five as the radios' own names,
 * and repeating the ends there would be furniture read aloud.
 *
 * **It resets the page when it mounts.** It replaces a room the reader may have
 * scrolled a long way down, with focus left on `<body>`, so it scrolls the
 * document to the top instantly — this is a new screen arriving, not a jump
 * within one — and hands focus to its own heading. That lives here rather than
 * in the page, so the preview scene arrives the same way the live one does.
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
 * **From `md` the statement stops being a stack and becomes a row**, and the
 * card widens to hold it: the sentence takes the slack on the left, the bar and
 * its word line sit at a fixed 320 on the right, and the sentence is centred on
 * the segment row rather than on the whole right-hand block. The two layouts
 * answer two different scarcities. On a phone width is the scarce thing, so the
 * bar takes the whole of it and the sentence goes above; on a desktop width is
 * plentiful and *height* is what runs out, and the narrow column stacked five
 * times was a tall thin ribbon of unused screen that a reader had to scroll for
 * no reason. Halving each statement's height is what puts all five, the note
 * and Done inside one viewport. Nothing changes below `md`.
 *
 * Purely presentational: the statements and whatever the form opens with arrive
 * as data, the answers leave through one callback, anything to say about how
 * that went comes back as a line the caller wrote, and nothing here reaches a
 * service, a route or a store.
 * Every item is optional and an unanswered one is a skip, which is why there is
 * no Skip button and why Done is never disabled for want of an answer.
 */
export function SessionFeedbackScreen<
  K extends SessionFeedbackItemKey = SessionFeedbackItemKey,
>({
  items,
  onDone,
  committing,
  lead,
  initial,
  status,
}: SessionFeedbackScreenProps<K>) {
  const t = useTranslations("voice.feedback");
  const groupId = useId();
  const noteFieldId = `${groupId}-note`;

  // Seeded lazily, which is the whole of how `initial` is "read once": the
  // initialiser runs on the first render and never again, so a prop that
  // changes later — a read landing behind the reader — cannot overwrite the
  // taps they have already made. Copied rather than held, so the screen's own
  // state is never the caller's object.
  const [answers, setAnswers] = useState<
    Partial<Record<K, SessionFeedbackRating>>
  >(() => ({ ...initial?.answers }));
  const [note, setNote] = useState(() => initial?.note ?? "");

  /**
   * The heading, which is where focus goes when the screen arrives.
   *
   * The room it replaces left focus on `<body>`, so without this the next Tab
   * restarts at the top of the document and a screen reader is told nothing at
   * all about the question that just appeared.
   */
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Instant, not smooth: a whole screen has been replaced, so there is no
    // position to carry the reader from — a smooth scroll would animate past
    // content they never asked to see.
    if (
      typeof window !== "undefined" &&
      typeof window.scrollTo === "function"
    ) {
      window.scrollTo(0, 0);
    }
    headingRef.current?.focus();
  }, []);

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
    // spans the full content width. From `sm` the card appears, capped at the
    // width the app gives a single-question page. From `md` the card widens to
    // `max-w-3xl` and the statements become rows — see the layout note in the
    // component doc: the narrow column stacked five times is the right answer
    // on a phone and a cramped one on a desktop.
    <div className="mx-auto w-full max-w-md space-y-6 sm:rounded-lg sm:border sm:border-border sm:bg-card sm:p-6 sm:shadow-sm md:max-w-3xl md:space-y-4 md:p-8">
      {/* Centred, at the size and alignment the app's other single-question
          cards give their title — this column borrows their width, so it
          borrows how the question is set at the top of it. Everything below
          the title stays left-aligned: statements are read, not announced. */}
      <div className="space-y-1 text-center">
        {lead !== undefined && (
          <p className="text-sm text-muted-foreground">{lead}</p>
        )}
        {/* `tabIndex={-1}` so the mount effect can land focus here: it makes
            the heading programmatically focusable without adding a tab stop a
            reader has to pass through on the way down the column. */}
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-semibold tracking-tight focus:outline-none"
        >
          {t("heading")}
        </h1>
      </div>

      {/* The rhythm between statements is the app's section gap, not a squeeze:
          each statement and its bar read as one block with clear air around it,
          which is what lets a reader answer a bar without checking which
          sentence it belongs to. From `md` a statement is a row rather than a
          stack, so it is half as tall and the gap closes with it — five rows,
          the note and Done then land inside one desktop viewport. */}
      <div className="space-y-6 md:space-y-2">
        {items.map((item) => {
          const labelId = `${groupId}-${item.key}`;
          // Named with its own type rather than left as the generic map's
          // lookup, so narrowing it below reaches the message key.
          const level: SessionFeedbackRating | undefined = answers[item.key];
          return (
            // One DOM block per statement at every width — the sentence, its
            // bar and its word line — so the radiogroup's `aria-labelledby`
            // never has to reach across a layout. The row is a grid *inside*
            // that block: from `md` the sentence takes the slack on the left
            // and the bar keeps a fixed 320 on the right, which is the width
            // five segments stay comfortably tappable at and the two end words
            // still fit under.
            <div
              key={item.key}
              className="md:grid md:grid-cols-[1fr_320px] md:items-start md:gap-6"
            >
              {/* Centred against the *segment row* rather than the whole
                  right-hand block: the word line below the bar is furniture,
                  and a sentence centred on it would sit visibly high of the
                  thing it labels. `min-h-11` rather than `h-11`, so a sentence
                  that wraps to two lines grows instead of overflowing. */}
              <p
                id={labelId}
                className="text-base leading-snug md:flex md:min-h-11 md:items-center"
              >
                {item.label}
              </p>
              <div>
                {/* The segments carry their own rounding, and the row clips
                  nothing: a segment's focus ring is drawn outside its own box
                  and is the only visible focus indicator the bar has, so a
                  clipping container would cut it off the first and last. */}
                <div
                  role="radiogroup"
                  aria-labelledby={labelId}
                  className="mt-2 flex gap-1 md:mt-0"
                >
                  {SESSION_FEEDBACK_RATINGS.map((rating) => (
                    // `h-11 items-end`: the whole row is the tap target and the
                    // block is bottom-aligned inside it, so the short segments
                    // are hit as easily as the tall ones.
                    <label
                      key={rating}
                      className="flex h-11 flex-1 cursor-pointer items-end"
                    >
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
                          // The rise: the drawn block grows with the level it
                          // stands for, while the label around it stays 44 tall.
                          SEGMENT_HEIGHTS[rating],
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
                {/* The line below the bar, in the bar's own five columns —
                  same widths, same gap — so anything on it lines up with a
                  segment above it.

                  While the statement is unanswered the ends name what the two
                  ends of the bar mean, and they are **prompt, not caption**:
                  they stand for the one moment a reader needs telling which way
                  the bar runs, and they go once a level is chosen. Clearing the
                  bar brings them back with the question. They are `aria-hidden`
                  because every one of the five words is already a radio's own
                  name, and a reader hearing the scale twice would be hearing
                  furniture.

                  The chosen word takes the column of the segment that was
                  tapped, so the caption points at the choice. It may be wider
                  than its column and overflows into the empty ones beside it
                  rather than wrapping or truncating — pulled in at the ends, so
                  a long word never leaves the bar. Every cell is pinned to row
                  one, so the word and the prompts share the one line and the
                  line's height never depends on what is in it: the answer
                  arrives, the prompts leave, and nothing below moves either
                  way.

                  `role="status"` is the word's identity, an advisory readout of
                  one value, and `aria-live` states the politeness that role
                  implies rather than leaving it inferred, so setting a level and
                  clearing one are both announced. It changes column with the
                  level and stays the same live region throughout. */}
                <div className="mt-1.5 grid min-h-4 grid-cols-5 items-baseline gap-1 overflow-visible text-xs font-medium leading-4">
                  <span
                    aria-hidden
                    className="col-start-1 row-start-1 min-w-max justify-self-start whitespace-nowrap text-left text-muted-foreground"
                  >
                    {level === undefined &&
                      t(`scale.${SESSION_FEEDBACK_RATING_KEYS[1]}`)}
                  </span>
                  <p
                    role="status"
                    aria-live="polite"
                    data-column={level}
                    className={cn(
                      "row-start-1 min-w-max whitespace-nowrap text-foreground",
                      // An unanswered line has no chosen segment to sit under,
                      // and the element is empty then — the middle column is
                      // where it waits, not a claim about a level.
                      WORD_CELL[level ?? 3],
                    )}
                  >
                    {level !== undefined &&
                      t(`scale.${SESSION_FEEDBACK_RATING_KEYS[level]}`)}
                  </p>
                  <span
                    aria-hidden
                    className="col-start-5 row-start-1 min-w-max justify-self-end whitespace-nowrap text-right text-muted-foreground"
                  >
                    {level === undefined &&
                      t(`scale.${SESSION_FEEDBACK_RATING_KEYS[5]}`)}
                  </span>
                </div>
              </div>
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
          // The cap the schema owns, made visible at the field: a reader stops
          // where the row stops instead of typing past it and having the tail
          // of their note quietly trimmed away on the way to storage.
          maxLength={SESSION_FEEDBACK_NOTE_MAX_LENGTH}
          value={note}
          disabled={committing}
          placeholder={t("notePrompt")}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <p className="text-sm text-muted-foreground">{t("audience")}</p>

      {/* Directly above Done, beside the button whose press it is about: a
          reader who has answered their way down the column is at the foot of
          it, and a line announced at the top would be off screen at the moment
          they decide whether to press again. It appears only when the caller
          hands one over, so nothing is held open for it. */}
      {status !== undefined && (
        <StatusLine status="destructive">{status}</StatusLine>
      )}

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
