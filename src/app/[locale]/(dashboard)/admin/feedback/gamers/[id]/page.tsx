import {
  feedbackMetadata,
  FeedbackDetailRoute,
} from "@/components/admin/feedback/feedback-routes";

export const generateMetadata = feedbackMetadata;

/** `/admin/feedback/gamers/[id]` — one gamer's feedback. */
export default function AdminFeedbackGamerRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <FeedbackDetailRoute kind="gamer" params={params} searchParams={searchParams} />;
}
