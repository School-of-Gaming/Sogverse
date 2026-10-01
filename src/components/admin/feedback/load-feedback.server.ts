import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { getLocale } from "next-intl/server";
import { wireErrorMessage } from "@/lib/api/wire-error-message";
import { DEFAULT_TIMEZONE, resolveLocale } from "@/lib/constants/locales";
import { createClient } from "@/lib/supabase/server";
import { FEEDBACK_SOURCES } from "@/services/session-feedback/admin-feedback.contracts";
import { SessionFeedbackService } from "@/services/session-feedback/session-feedback.service";
import { earliestAnswerDay } from "./aggregate-feedback";
import type { FeedbackRead } from "./feedback-nav";
import {
  FEEDBACK_FROM_PARAM,
  FEEDBACK_HISTORY_FLOOR,
  FEEDBACK_TO_PARAM,
  feedbackHistory,
  minimumSelectionDays,
  parseSelection,
} from "./feedback-selection";
import { bucketUnitFor, type FeedbackPeriod } from "./feedback-tally";

/** What every feedback route reads before it renders. Never both, never neither. */
export type FeedbackLoad =
  | ({ ok: true } & FeedbackRead)
  | { ok: false; reason: string | null };

/** The selection `?from=&to=` names inside a history, at that history's bucket. */
function selectionIn(
  params: Record<string, string | string[] | undefined>,
  history: FeedbackPeriod,
): FeedbackPeriod {
  return parseSelection(
    params[FEEDBACK_FROM_PARAM],
    params[FEEDBACK_TO_PARAM],
    history,
    minimumSelectionDays(bucketUnitFor(history)),
  );
}

/**
 * **The read behind every feedback page**: every session day from the floor
 * to today in Finland (session days are club-local, and every club is run
 * from there), in one read, so the page can draw the whole history and move
 * its selection without reading again. The history the timeline draws starts
 * at the first answer, and the selection is the one `?from=&to=` names,
 * clamped into it.
 *
 * **A failure is carried, not flattened**: "nobody said anything" and "the
 * read failed" must never look the same, because the first is an answer
 * somebody could act on.
 */
export async function loadFeedback(
  params: Record<string, string | string[] | undefined>,
): Promise<FeedbackLoad> {
  const today = formatInTimeZone(new Date(), DEFAULT_TIMEZONE, "yyyy-MM-dd");
  const source = FEEDBACK_SOURCES[0];

  // Outside the `try`: building the server client reads cookies, and a
  // dynamic-render signal travels as a thrown control-flow object that must not
  // be reported as a failed read.
  const supabase = await createClient();
  const service = new SessionFeedbackService(supabase);
  // Product names come back in the reader's locale.
  const locale = resolveLocale(await getLocale());

  try {
    const dataset = await service.getAdminDataset(
      { from: FEEDBACK_HISTORY_FLOOR, to: today },
      locale,
    );
    const history = feedbackHistory(earliestAnswerDay(dataset, source), today);
    return { ok: true, source, dataset, history, selection: selectionIn(params, history) };
  } catch (error) {
    return { ok: false, reason: wireErrorMessage(error) };
  }
}
