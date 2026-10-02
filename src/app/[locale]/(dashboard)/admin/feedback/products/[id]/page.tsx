import {
  feedbackMetadata,
  FeedbackDetailRoute,
} from "@/components/admin/feedback/feedback-routes";

export const generateMetadata = feedbackMetadata;

/** `/admin/feedback/products/[id]` — one product's feedback. */
export default function AdminFeedbackProductRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <FeedbackDetailRoute kind="product" params={params} searchParams={searchParams} />;
}
