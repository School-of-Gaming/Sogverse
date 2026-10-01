import {
  feedbackMetadata,
  FeedbackListRoute,
} from "@/components/admin/feedback/feedback-routes";

export const generateMetadata = feedbackMetadata;

/** `/admin/feedback/products` — every product with feedback in the range, worst first. */
export default function AdminFeedbackProductsRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <FeedbackListRoute dimension="product" searchParams={searchParams} />;
}
