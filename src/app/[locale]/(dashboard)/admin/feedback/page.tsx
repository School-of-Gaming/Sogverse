import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { getLocale, getTranslations } from "next-intl/server";
import {
  AdminFeedbackLoadFailure,
  AdminFeedbackPage,
} from "@/components/admin/feedback/admin-feedback-page";
import { parseFeedbackFilters } from "@/components/admin/feedback/feedback-filters";
import {
  feedbackRangeBounds,
  resolveFeedbackRange,
} from "@/components/admin/feedback/feedback-range";
import { DEFAULT_TIMEZONE, resolveLocale } from "@/lib/constants/locales";
import { invoicingWireReason } from "@/lib/invoicing/month-param";
import { createClient } from "@/lib/supabase/server";
import type { AdminFeedbackDataset } from "@/services/session-feedback/admin-feedback.contracts";
import { SessionFeedbackService } from "@/services/session-feedback/session-feedback.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminFeedback") };
}

/** The read, or the reason it did not happen. Never both, never neither. */
type DatasetResult =
  | { ok: true; dataset: AdminFeedbackDataset }
  | { ok: false; reason: string | null };

/**
 * The range, awaited here so the page arrives finished.
 *
 * **A failure is carried, not flattened**: "nobody said anything" and "the read
 * failed" must never look the same, because the first is an answer somebody
 * could act on.
 */
async function loadRange(from: string, to: string): Promise<DatasetResult> {
  // Outside the `try`: building the server client reads cookies, and a
  // dynamic-render signal travels as a thrown control-flow object that must not
  // be reported as a failed read.
  const supabase = await createClient();
  const service = new SessionFeedbackService(supabase);
  // Product names come back in the reader's locale.
  const locale = resolveLocale(await getLocale());

  try {
    return { ok: true, dataset: await service.getAdminDataset({ from, to }, locale) };
  } catch (error) {
    return { ok: false, reason: invoicingWireReason(error) };
  }
}

/**
 * `/admin/feedback` — how sessions are landing with the people in them.
 *
 * The route owns the range: it reads `?range=`, measures it back from today in
 * Finland (the session days the dataset is keyed on are club-local, and every
 * club is run from there), and reads the dataset once. Choosing another range
 * re-runs this route. The drill-down filters are parsed here too, only so the
 * server paints the page already narrowed — after that the client owns them,
 * and a filter never comes back to the server.
 *
 * The dataset is handed straight to the page rather than through the query
 * cache: nothing on the page refetches it, and a range change is a new render
 * of this route with a new dataset.
 */
export default async function AdminFeedbackRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const range = resolveFeedbackRange(params.range);
  const today = formatInTimeZone(new Date(), DEFAULT_TIMEZONE, "yyyy-MM-dd");
  const { from, to } = feedbackRangeBounds(range, today);
  const result = await loadRange(from, to);

  if (!result.ok) {
    return <AdminFeedbackLoadFailure reason={result.reason} />;
  }

  const initialFilters = parseFeedbackFilters(params);

  return (
    // Keyed on the filters the URL arrived with. A range choice carries the
    // filters along, so the page keeps its tab and toggles across it; a link
    // that arrives with other filters (the sidebar's, with none) is a fresh
    // page, and must not keep the drill-down the previous one held.
    <AdminFeedbackPage
      key={JSON.stringify(initialFilters)}
      range={range}
      dataset={result.dataset}
      initialFilters={initialFilters}
    />
  );
}
