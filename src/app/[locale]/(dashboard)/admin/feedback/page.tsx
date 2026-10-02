import {
  feedbackMetadata,
  FeedbackOverviewRoute,
} from "@/components/admin/feedback/feedback-routes";

export const generateMetadata = feedbackMetadata;

/** `/admin/feedback` — the overview: the pulse, and the doors to the lists. */
export default function AdminFeedbackRoute() {
  return <FeedbackOverviewRoute />;
}
