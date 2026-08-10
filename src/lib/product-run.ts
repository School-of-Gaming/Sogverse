import { endDateToCutoff } from "@/lib/session-occurrence";
import { isVoiceWindowOpen } from "@/lib/voice-window";

/**
 * Where a product's **run** stands as of one instant: whether it is over, and
 * whether something is happening right now.
 *
 * Both questions are asked of the *product*, not of whoever is looking at it —
 * a club is over on the same day for the gedu who taught it and the family who
 * attended it — so they live in one neutral module that a staff roll-up and a
 * family roll-up can both call. Wrapping them in role vocabulary is each
 * surface's own business; the arithmetic is not.
 *
 * Pure and instant-in, so a card, a preview fixture and a test all ask the same
 * question the same way. **Neither answer may be baked into a summary built once
 * per data change**: both are facts about the current instant, and a summary
 * would go on reporting yesterday's answer until something else caused it to be
 * rebuilt.
 */

/** The dates a "has this run finished" question is asked of. */
export interface ProductRunDates {
  /**
   * The product's last day as a bare `YYYY-MM-DD` calendar date, or `null` on
   * an open-ended run that has no last day at all.
   */
  endDate: string | null;
  /** The zone `endDate` is a date **in** — the product's own. */
  timezone: string;
  /** Start of the soonest session still worth showing, `null` when there is none. */
  nextSessionStart: Date | null;
}

/** The session facts a "is this happening now" question is asked of. */
export interface ProductRunSession {
  nextSessionStart: Date | null;
  nextSessionEnd: Date | null;
  /** Whether there is a voice room at all — true only for a remote product. */
  hasVoiceRoom: boolean;
}

/**
 * The product's last day, **if the run is over** — and `null` otherwise, which
 * covers both a run still going and an open-ended one that has no last day at
 * all.
 *
 * One function rather than a boolean and a date, because the two are the same
 * answer: a run that has ended always has a date to name, and one with no date
 * to name has not ended. Returning the date makes that true in the types as well
 * as in prose, so no caller ever has to assert its way past a `null` it has
 * already tested.
 *
 * **Over means two things, and it needs both.** The last day has to be behind
 * us, *and* the occurrence walk has to have nothing left — which is the
 * observation the whole ended state grew out of: a product always has a session
 * scheduled unless it has finished. The second clause is redundant on every
 * ordinary run and decisive on one case, a session that starts on the final day
 * and is still running after that day's midnight. Without it a card could be
 * "ended" and mid-session at once — gradient lit, Join withheld, an end date
 * under a session somebody is sitting in. With it the two states are exclusive
 * by construction, which is what lets a card drop its next-session line outright
 * rather than reasoning about which of them wins.
 *
 * The day ends **in the product's own zone**, not the viewer's, and via the same
 * cutoff the occurrence walk bounds itself with — so "past the end date" means
 * the identical instant to both of them. An end date is a calendar date on the
 * schedule it bounds: a Helsinki club is over when Helsinki's last day is over,
 * and a viewer in Tokyo does not get to retire it seven hours early.
 */
export function runEndedOn(run: ProductRunDates, now: Date): string | null {
  const { endDate, timezone, nextSessionStart } = run;
  if (endDate === null || nextSessionStart !== null) return null;
  const lastMoment = endDateToCutoff(endDate, timezone);
  return lastMoment !== null && lastMoment.getTime() < now.getTime()
    ? endDate
    : null;
}

/** Whether a run is happening right now, as of one instant. */
export interface RunLiveness {
  /** The next session has already started — it is running as you look at it. */
  inProgress: boolean;
  /**
   * The voice window around that session is open. Always false without a room:
   * an in-person product has no window to be inside, and a card lighting up on
   * this would be announcing a room that does not exist.
   */
  voiceIsOpen: boolean;
}

/**
 * Whether a run is live, asked at the moment of asking.
 *
 * **A card has one clock.** Both halves of "is this happening now" are derived
 * here from the same `now`, so the gradient, the Live badge and the Join button
 * can never disagree — which is exactly what happened when the window flag was
 * baked into a summary and the in-progress test was recomputed per tick: on the
 * tick that crossed a session's start the card went live and its Join stayed
 * locked until something else caused the roll-up to run again.
 */
export function runLiveness(run: ProductRunSession, now: Date): RunLiveness {
  const { nextSessionStart, nextSessionEnd, hasVoiceRoom } = run;
  if (nextSessionStart === null || nextSessionEnd === null) {
    return { inProgress: false, voiceIsOpen: false };
  }
  return {
    inProgress: nextSessionStart.getTime() <= now.getTime(),
    voiceIsOpen:
      hasVoiceRoom && isVoiceWindowOpen(nextSessionStart, nextSessionEnd, now),
  };
}
