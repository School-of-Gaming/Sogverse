import {
  feedbackMetadata,
  FeedbackDetailRoute,
} from "@/components/admin/feedback/feedback-routes";

export const generateMetadata = feedbackMetadata;

/** `/admin/feedback/groups/[id]` — one group's feedback. */
export default function AdminFeedbackGroupRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <FeedbackDetailRoute kind="group" params={params} searchParams={searchParams} />;
}
