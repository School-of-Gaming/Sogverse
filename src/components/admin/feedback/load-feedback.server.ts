import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { getLocale } from "next-intl/server";
import { wireErrorMessage } from "@/lib/api/wire-error-message";
import { DEFAULT_TIMEZONE, resolveLocale } from "@/lib/constants/locales";
import { createClient } from "@/lib/supabase/server";
import {
  FEEDBACK_SOURCES,
  type AdminFeedbackDataset,
  type FeedbackSource,
} from "@/services/session-feedback/admin-feedback.contracts";
import { SessionFeedbackService } from "@/services/session-feedback/session-feedback.service";
import type { FeedbackPeriods } from "./aggregate-feedback";
import {
  FEEDBACK_RANGE_PARAM,
  feedbackRangePeriods,
  feedbackReadSpan,
  resolveFeedbackRange,
  type FeedbackRange,
} from "./feedback-range";

/** What every feedback route reads before it renders. Never both, never neither. */
export type FeedbackLoad =
  | {
      ok: true;
      range: FeedbackRange;
      periods: FeedbackPeriods;
      /** The one source collected today; a second arrives as a switch beside the range. */
      source: FeedbackSource;
      dataset: AdminFeedbackDataset;
    }
  | { ok: false; range: FeedbackRange; reason: string | null };

/**
 * **The read behind every feedback page**: the range from `?range=`, its two
 * periods measured back from today in Finland (session days are club-local,
 * and every club is run from there), and one read spanning both, so each
 * builder can compare the period on show with the one before it.
 *
 * **A failure is carried, not flattened**: "nobody said anything" and "the
 * read failed" must never look the same, because the first is an answer
 * somebody could act on.
 */
export async function loadFeedback(
  params: Record<string, string | string[] | undefined>,
): Promise<FeedbackLoad> {
  const range = resolveFeedbackRange(params[FEEDBACK_RANGE_PARAM]);
  const today = formatInTimeZone(new Date(), DEFAULT_TIMEZONE, "yyyy-MM-dd");
  const periods = feedbackRangePeriods(range, today);

  // Outside the `try`: building the server client reads cookies, and a
  // dynamic-render signal travels as a thrown control-flow object that must not
  // be reported as a failed read.
  const supabase = await createClient();
  const service = new SessionFeedbackService(supabase);
  // Product names come back in the reader's locale.
  const locale = resolveLocale(await getLocale());

  try {
    const dataset = await service.getAdminDataset(feedbackReadSpan(periods), locale);
    return { ok: true, range, periods, source: FEEDBACK_SOURCES[0], dataset };
  } catch (error) {
    return { ok: false, range, reason: wireErrorMessage(error) };
  }
}
