import {
  feedbackMetadata,
  FeedbackResponsesRoute,
} from "@/components/admin/feedback/feedback-routes";

export const generateMetadata = feedbackMetadata;

/** `/admin/feedback/responses` — what gamers said across the platform, worth reading first. */
export default function AdminFeedbackResponsesRoute() {
  return <FeedbackResponsesRoute />;
}
