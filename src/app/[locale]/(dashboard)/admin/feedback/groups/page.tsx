import {
  feedbackMetadata,
  FeedbackListRoute,
} from "@/components/admin/feedback/feedback-routes";

export const generateMetadata = feedbackMetadata;

/** `/admin/feedback/groups` — every group with feedback, worst first. */
export default function AdminFeedbackGroupsRoute() {
  return <FeedbackListRoute dimension="group" />;
}
