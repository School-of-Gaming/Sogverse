import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api/api-error";
import { defineRoute } from "@/lib/api/define-route";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import { createAdminClient } from "@/lib/supabase/admin";
import { GUIDES_BUCKET } from "@/services/guides/guides.contracts";
import { guideContentDisposition } from "@/services/guides/guides.server";
import { GuidesService } from "@/services/guides/guides.service";

/**
 * GET /api/guides/[id]/download?locale=<locale> — one guide's PDF, in the
 * reader's language by the reader fallback, for a signed-in reader the
 * database lets have it.
 *
 * **Who may have it is the database's answer, asked on the reader's own
 * session**: any signed-in account for a guide the published copy of a live
 * landing page places, an admin for any guide. The route only establishes that
 * there is a session to ask as — every role, through the shared role gate, so a
 * locked parent session and an account still owing its registration are
 * refused here as on every other route. Only then is the chosen object read,
 * with the service role, since the bucket is private and only an admin's
 * session could read it directly. No URL to the object is ever handed out.
 *
 * **Nothing to download and not allowed to download answer the same 404**: a
 * guide no live page places, one that does not exist, and an id that is not a
 * guide's are one answer, so the route says nothing about which guides exist.
 *
 * **The language is the page's**, which the page puts in the link: this route
 * is outside the `[locale]` tree.
 */
export const GET = defineRoute({
  posture: "role-gated",
  roles: ["admin", "customer", "gamer", "gedu"],

  params: z.object({ id: z.string().uuid() }),
  query: z.object({ locale: z.enum(SUPPORTED_LOCALES) }),

  handler: async ({ supabase, params, query }) => {
    const file = await new GuidesService(supabase).getGuideDownload(params.id, query.locale);
    if (file === null) {
      throw new ApiError(`no guide ${params.id} this caller may download`, 404);
    }

    const { data, error } = await createAdminClient()
      .storage.from(GUIDES_BUCKET)
      .download(file.storagePath);
    if (error !== null) {
      // The database names an object the bucket does not hold: a fault, not a
      // refusal, so it surfaces as one.
      throw new ApiError(
        `guide ${params.id} names ${file.storagePath}, which could not be read: ${error.message}`,
        500,
      );
    }

    return new NextResponse(data, {
      headers: {
        // The store admits only bytes that start as a PDF.
        "Content-Type": "application/pdf",
        "Content-Disposition": guideContentDisposition("attachment", file.fileName),
        // Who may have it is decided per request, and a browser cache is keyed
        // to the browser profile, which a family shares across an account
        // switch — so nothing is kept anywhere.
        "Cache-Control": "private, no-store",
      },
    });
  },
});
