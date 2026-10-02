import { cn } from "@/lib/utils";
import {
  SESSION_FEEDBACK_RATINGS,
  SESSION_FEEDBACK_SEGMENT_PX,
  type SessionFeedbackRating,
} from "./session-feedback-items";

/** The screen's segment heights are drawn as proportions of this, so the meter rises at its rate at any size. */
const TALLEST = SESSION_FEEDBACK_SEGMENT_PX[5];

/**
 * **One answer, drawn the way the gamer gave it** — the feedback screen's
 * charge bar at a glance's size, and read-only.
 *
 * Five blocks rise left to right like a signal meter, and the answer fills them
 * in act from the first through the chosen level, exactly as the bar looked
 * when the gamer pressed Done. An unanswered statement is the empty track: five
 * blocks in the lifted grey, the same picture the screen shows before a tap.
 *
 * It is a picture, not a control — there is nothing to choose — so it carries
 * one text equivalent, the caller's `label`, and no radios. The caller states
 * the level's word beside it for sighted readers; the meter never draws a word
 * itself.
 */
export function SessionFeedbackMeter({
  level,
  label,
}: {
  /** The chosen level, or `undefined` for a statement left unanswered. */
  level: SessionFeedbackRating | undefined;
  /** What the meter shows, in words: the level's word, or the caller's "skipped". */
  label: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className="inline-flex h-4 w-14 shrink-0 items-end gap-0.5"
    >
      {SESSION_FEEDBACK_RATINGS.map((rating) => (
        <span
          key={rating}
          className={cn(
            "block flex-1 rounded-xs",
            level !== undefined && rating <= level ? "bg-act" : "bg-lifted",
          )}
          style={{ height: `${(SESSION_FEEDBACK_SEGMENT_PX[rating] / TALLEST) * 100}%` }}
        />
      ))}
    </span>
  );
}
