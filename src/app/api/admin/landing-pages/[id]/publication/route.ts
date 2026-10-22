import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import {
  publishLandingPage,
  unpublishLandingPage,
} from "@/lib/indexnow/landing-pages";
import { LandingPageService } from "@/services/landing-pages/landing-pages.service";

const params = z.object({ id: z.string().uuid() });

const DISCLOSE_REASON =
  "the database refuses a publish with a sentence written for the admin (no complete language to publish, the page is gone), and the status page shows it verbatim, judging it by its code exactly as it would a refusal from the database directly";

/**
 * PUT /api/admin/landing-pages/[id]/publication — publish the page's saved
 * working copy. DELETE — take the page off the site.
 *
 * The admin's status page publishes through here rather than calling the
 * database from the browser, because after the change succeeds the server
 * tells search engines what it changed (IndexNow, `src/lib/indexnow/`). The
 * change itself runs on the admin's own session, so the guarded database
 * functions decide exactly as they would in the browser. Answers 204.
 */
export const PUT = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can publish landing pages",
  params,
  discloseErrorMessages: DISCLOSE_REASON,

  handler: async ({ supabase, params: { id } }) => {
    await publishLandingPage(new LandingPageService(supabase), id);
  },
});

export const DELETE = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can unpublish landing pages",
  params,
  discloseErrorMessages: DISCLOSE_REASON,

  handler: async ({ supabase, params: { id } }) => {
    await unpublishLandingPage(new LandingPageService(supabase), id);
  },
});
