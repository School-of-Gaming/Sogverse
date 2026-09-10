import "server-only";
import { cookies } from "next/headers";
import {
  TOPIC_PREP_COOKIE_NAME,
  topicPrepReadyFor,
} from "./topic-prep-cookie";

/**
 * Which of this viewer's enrolments have already been finished with, read on
 * the server while the dashboard is being rendered.
 *
 * The server-side mirror of the browser's write, parsed by the same function —
 * so the HTML a family receives already shows the right footer on every card
 * and nothing swaps a tick after hydration. That swap is the whole reason this
 * cookie exists: the guide used to be remembered in `localStorage`, which a
 * server cannot read, so every card had to render its *undismissed* state first
 * and correct itself once the browser had answered.
 *
 * Returns participation ids, already scoped to this viewer — a parent and a
 * child share one browser, and the filtering belongs where the reader's id is
 * known for certain.
 */
export async function getServerTopicPrepReady(
  viewerId: string | null,
): Promise<ReadonlySet<string>> {
  const cookieStore = await cookies();
  return topicPrepReadyFor(
    cookieStore.get(TOPIC_PREP_COOKIE_NAME)?.value,
    viewerId,
  );
}
