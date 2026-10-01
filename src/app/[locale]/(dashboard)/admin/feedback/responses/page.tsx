import {
  feedbackMetadata,
  FeedbackResponsesRoute,
} from "@/components/admin/feedback/feedback-routes";

export const generateMetadata = feedbackMetadata;

/** `/admin/feedback/responses` — what gamers said across the platform, worth reading first. */
export default function AdminFeedbackResponsesRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <FeedbackResponsesRoute searchParams={searchParams} />;
}
