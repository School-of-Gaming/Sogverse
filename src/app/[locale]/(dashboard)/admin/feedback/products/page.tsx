import {
  feedbackMetadata,
  FeedbackListRoute,
} from "@/components/admin/feedback/feedback-routes";

export const generateMetadata = feedbackMetadata;

/** `/admin/feedback/products` — every product with feedback, worst first. */
export default function AdminFeedbackProductsRoute() {
  return <FeedbackListRoute dimension="product" />;
}
