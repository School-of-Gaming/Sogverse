import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { getLocale } from "next-intl/server";
import { wireErrorMessage } from "@/lib/api/wire-error-message";
import { DEFAULT_TIMEZONE, resolveLocale } from "@/lib/constants/locales";
import { createClient } from "@/lib/supabase/server";
import { FEEDBACK_SOURCES } from "@/services/session-feedback/admin-feedback.contracts";
import { SessionFeedbackService } from "@/services/session-feedback/session-feedback.service";
import { feedbackHistory, type FeedbackRead } from "./aggregate-feedback";

/**
 * The first session day the read asks for. Gamers began answering in
 * September 2026; the floor sits well before that so back-dated seed history
 * is read whole. Reading every day since is cheap at this volume — a few
 * thousand responses and sessions a year.
 */
const FEEDBACK_HISTORY_FLOOR = "2026-01-01";

/** What every feedback route reads before it renders. Never both, never neither. */
export type FeedbackLoad =
  | ({ ok: true } & FeedbackRead)
  | { ok: false; reason: string | null };

/**
 * **The read behind every feedback page**: every session day from the floor
 * to today in Finland (session days are club-local, and every club is run
 * from there), in one read. The pages' history starts at the first answer's
 * session day, and every figure covers that history: the sessions read from
 * before it predate the feedback prompt and count toward nothing.
 *
 * **A failure is carried, not flattened**: "nobody said anything" and "the
 * read failed" must never look the same, because the first is an answer
 * somebody could act on.
 */
export async function loadFeedback(): Promise<FeedbackLoad> {
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
    return { ok: true, source, dataset, history: feedbackHistory(dataset, source, today) };
  } catch (error) {
    return { ok: false, reason: wireErrorMessage(error) };
  }
}
