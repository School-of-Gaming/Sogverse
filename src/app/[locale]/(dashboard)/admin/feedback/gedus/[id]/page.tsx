import {
  feedbackMetadata,
  FeedbackDetailRoute,
} from "@/components/admin/feedback/feedback-routes";

export const generateMetadata = feedbackMetadata;

/** `/admin/feedback/gedus/[id]` — one gedu's feedback. */
export default function AdminFeedbackGeduRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <FeedbackDetailRoute kind="gedu" params={params} searchParams={searchParams} />;
}
