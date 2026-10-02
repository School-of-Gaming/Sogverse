import {
  feedbackMetadata,
  FeedbackListRoute,
} from "@/components/admin/feedback/feedback-routes";

export const generateMetadata = feedbackMetadata;

/** `/admin/feedback/gedus` — every gedu with feedback, worst first. */
export default function AdminFeedbackGedusRoute() {
  return <FeedbackListRoute dimension="gedu" />;
}
