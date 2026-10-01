import {
  feedbackMetadata,
  FeedbackListRoute,
} from "@/components/admin/feedback/feedback-routes";

export const generateMetadata = feedbackMetadata;

/** `/admin/feedback/groups` — every group with feedback in the range, worst first. */
export default function AdminFeedbackGroupsRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <FeedbackListRoute dimension="group" searchParams={searchParams} />;
}
