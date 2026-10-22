import { z } from "zod";
import { ApiError } from "@/lib/api/api-error";
import { defineRoute } from "@/lib/api/define-route";
import { GUIDES_BUCKET, guideLocale } from "@/services/guides/guides.contracts";
import { guideContentDisposition } from "@/services/guides/guides.server";

/**
 * GET /api/admin/guides/[id]/file?locale=<locale> — one guide's file in
 * exactly that language, for an admin checking what they uploaded.
 *
 * **Exact, never the reader's fallback.** The download readers use picks the
 * reader's language, else English, else the earliest language with a file in
 * `SUPPORTED_LOCALES` order; an admin opening
 * the Swedish tab wants the Swedish file, and a missing one is a 404 rather
 * than another language's bytes.
 *
 * **Read entirely on the admin's own session.** The file's row is a plain read
 * under the table's admin-only policy, and the object is downloaded on the
 * same client, which the private bucket's admin read policy admits. No
 * service role and no signed URL: the bucket never hands out an address.
 *
 * Served inline, so the browser opens the PDF in a tab, and never cached: a
 * replaced file has a new object, but this address stays the same.
 */
export const GET = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can open a guide's file",

  params: z.object({ id: z.string().uuid() }),
  query: z.object({ locale: guideLocale }),

  handler: async ({ params, query, supabase }) => {
    const { data: file, error } = await supabase
      .from("guide_files")
      .select("storage_path, file_name")
      .eq("guide_id", params.id.toLowerCase())
      // exact-locale: the admin is checking that one language's file
      .eq("locale", query.locale)
      .maybeSingle();
    if (error) throw error;
    if (file === null) {
      throw new ApiError(`guide ${params.id} has no ${query.locale} file`, 404);
    }

    const { data, error: downloadError } = await supabase.storage
      .from(GUIDES_BUCKET)
      .download(file.storage_path);
    if (downloadError !== null) {
      throw new ApiError(
        `guide ${params.id}'s ${query.locale} object could not be read: ${downloadError.message}`,
        500,
      );
    }

    return new Response(data, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": guideContentDisposition("inline", file.file_name),
        "Cache-Control": "private, no-store",
      },
    });
  },
});
