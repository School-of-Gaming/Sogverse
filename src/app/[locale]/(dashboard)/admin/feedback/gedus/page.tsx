import {
  feedbackMetadata,
  FeedbackListRoute,
} from "@/components/admin/feedback/feedback-routes";

export const generateMetadata = feedbackMetadata;

/** `/admin/feedback/gedus` — every gedu with feedback in the range, worst first. */
export default function AdminFeedbackGedusRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <FeedbackListRoute dimension="gedu" searchParams={searchParams} />;
}
