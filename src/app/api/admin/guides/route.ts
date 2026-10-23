import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  GUIDE_UPLOAD_DATABASE_REFUSAL,
  GUIDE_UPLOAD_MAX_BYTES,
  type GuideUploadResponse,
  guideLocale,
  guideWriteFailure,
  type GuideUploadRefusalCode,
} from "@/services/guides/guides.contracts";
import { storeGuideFile, type GuideTarget } from "@/services/guides/guides.server";

/** The HTTP status each refusal of the store answers with. */
const REFUSAL_STATUS: Record<GuideUploadRefusalCode, number> = {
  empty: 422,
  too_large: 413,
  not_pdf: 415,
  label: 422,
};

/** PostgreSQL's no_data_found: the guide named is gone. */
const NO_DATA_FOUND = "P0002";

function badRequest(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 });
}

/**
 * POST /api/admin/guides — multipart: one `file` (a PDF), its `locale`, and
 * either the `guideId` it goes to or the `label` of a new guide it creates.
 *
 * Stores one language's file of a guide through the one store function the
 * MCP tool shares, at the admin tab's cap. A new guide is created together
 * with its first file, since a guide is never empty; a file for a language
 * the guide already has replaces it, everywhere the guide is offered at once.
 *
 * A refusal the admin can act on answers with its code — `empty`,
 * `too_large`, `not_pdf`, `label`, or `refused` for the database's own
 * sentence (a label too long, the guide gone) — which the page translates.
 * Anything else is a generic failure.
 *
 * No body schema is declared on the primitive, which leaves the request
 * stream untouched so the handler can read the form itself.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can upload a guide",

  handler: async ({ request, supabase }): Promise<GuideUploadResponse | NextResponse> => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return badRequest("Request must be multipart/form-data");
    }

    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("Missing 'file' field");

    const locale = guideLocale.safeParse(form.get("locale"));
    if (!locale.success) return badRequest("'locale' must be one of the site's locales");

    const guideId = form.get("guideId");
    const label = form.get("label");
    let target: GuideTarget;
    if (typeof guideId === "string" && label === null) {
      if (!z.string().uuid().safeParse(guideId).success) {
        return badRequest("'guideId' must be a guide's id");
      }
      target = { kind: "existing", guideId };
    } else if (typeof label === "string" && guideId === null) {
      target = { kind: "new", label };
    } else {
      return badRequest("Send either 'guideId' or 'label', not both");
    }

    let stored;
    try {
      // The bucket on the service-role client, its one writer; the guide's rows
      // on the admin's own session, where the admin-guarded functions decide.
      stored = await storeGuideFile({
        db: supabase,
        admin: createAdminClient(),
        bytes: new Uint8Array(await file.arrayBuffer()),
        fileName: file.name,
        target,
        locale: locale.data,
        maxBytes: GUIDE_UPLOAD_MAX_BYTES,
      });
    } catch (error) {
      // Only the codes whose sentence an admin can act on are quoted; every
      // other failure falls through to the primitive's generic answer.
      const failure = guideWriteFailure(error);
      if (failure.kind === "unknown") throw error;
      const gone =
        typeof error === "object" && error !== null && "code" in error && error.code === NO_DATA_FOUND;
      return NextResponse.json(
        { error: failure.reason, code: GUIDE_UPLOAD_DATABASE_REFUSAL },
        { status: gone ? 404 : 400 },
      );
    }

    if (stored.status === "refused") {
      return NextResponse.json(
        { error: stored.refusal.error, code: stored.refusal.code },
        { status: REFUSAL_STATUS[stored.refusal.code] },
      );
    }

    return {
      guideId: stored.guideId,
      created: stored.created,
      locale: stored.locale,
      fileName: stored.fileName,
      byteSize: stored.byteSize,
      replaced: stored.replaced,
    };
  },
});
