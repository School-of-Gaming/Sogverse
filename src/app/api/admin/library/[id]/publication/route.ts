import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import {
  publishLibraryArticle,
  unpublishLibraryArticle,
} from "@/lib/indexnow/library";
import { LibraryService } from "@/services/library/library.service";

const params = z.object({ id: z.string().uuid() });

const DISCLOSE_REASON =
  "the database refuses a publish with a sentence written for the admin (no category, no complete language, the article is gone), and the editor shows it verbatim, judging it by its code exactly as it would a refusal from the database directly";

/**
 * PUT /api/admin/library/[id]/publication — publish the article's saved
 * working copy. DELETE — take it off the public Library.
 *
 * The editor publishes through here rather than calling the database from
 * the browser, because after the change succeeds the server tells search
 * engines what it changed (IndexNow, `src/lib/indexnow/`). The change itself
 * runs on the admin's own session, so the guarded database functions decide
 * exactly as they would in the browser. Answers 204.
 */
export const PUT = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can publish Library articles",
  params,
  discloseErrorMessages: DISCLOSE_REASON,

  handler: async ({ supabase, params: { id } }) => {
    await publishLibraryArticle(new LibraryService(supabase), id);
  },
});

export const DELETE = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can unpublish Library articles",
  params,
  discloseErrorMessages: DISCLOSE_REASON,

  handler: async ({ supabase, params: { id } }) => {
    await unpublishLibraryArticle(new LibraryService(supabase), id);
  },
});
