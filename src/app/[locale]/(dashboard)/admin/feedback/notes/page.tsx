import {
  feedbackMetadata,
  FeedbackNotesRoute,
} from "@/components/admin/feedback/feedback-routes";

export const generateMetadata = feedbackMetadata;

/** `/admin/feedback/notes` — every note in the range. */
export default function AdminFeedbackNotesRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <FeedbackNotesRoute searchParams={searchParams} />;
}
