import { parseJsonResponse } from "@/lib/api/json-response";
import type { SupportedLocale } from "@/lib/constants/locales";
import {
  GUIDE_UPLOAD_DATABASE_REFUSAL,
  GUIDE_UPLOAD_MAX_BYTES,
  guideUploadErrorBody,
  guideUploadResponse,
  type GuideUploadRefusalCode,
  type GuideUploadResponse,
} from "@/services/guides/guides.contracts";

/**
 * The admin tab's upload, the browser's end of the wire; the route's answer
 * and refusal shapes are in the guides contracts.
 *
 * A file's bytes go to a private bucket on the service-role client, so an
 * upload is a route rather than a service method on the admin's session; the
 * route stores through the one store function the MCP tool shares.
 */

/** The upload route: multipart, `file` and `locale`, then `guideId` or `label`. */
export const ADMIN_GUIDES_UPLOAD_PATH = "/api/admin/guides";

/**
 * Where an admin opens one guide's file in one exact language — never the
 * reader's fallback, since the admin is checking that language's file. A raw
 * API path, not a page: no locale prefix applies.
 */
export function adminGuideFilePath(guideId: string, locale: SupportedLocale): string {
  return `/api/admin/guides/${encodeURIComponent(guideId)}/file?locale=${locale}`;
}

/** Why an upload did not store, as the page tells the admin. */
export type GuideUploadFailure =
  | { kind: "refused"; code: GuideUploadRefusalCode }
  | { kind: "reason"; reason: string }
  | { kind: "unknown" };

export class GuideUploadError extends Error {
  constructor(readonly failure: GuideUploadFailure) {
    super(failure.kind === "reason" ? failure.reason : `guide upload failed: ${failure.kind}`);
    this.name = "GuideUploadError";
  }
}

/**
 * What is wrong with a picked file before it is sent: empty, or over the
 * route's cap. The cap is checked here as well as on the server because a
 * file over the platform's body limit never reaches the route at all.
 */
export function guideFilePickRefusal(file: File): GuideUploadRefusalCode | null {
  if (file.size === 0) return "empty";
  if (file.size > GUIDE_UPLOAD_MAX_BYTES) return "too_large";
  return null;
}

/** Which guide a file goes to: one already stored, or a new one with its label. */
export type GuideUploadTarget =
  | { kind: "existing"; guideId: string }
  | { kind: "new"; label: string };

/**
 * Send one language's file. Resolves once it is stored; rejects with a
 * `GuideUploadError` saying why not.
 */
export async function uploadGuideFile({
  file,
  locale,
  target,
}: {
  file: File;
  locale: SupportedLocale;
  target: GuideUploadTarget;
}): Promise<GuideUploadResponse> {
  const refused = guideFilePickRefusal(file);
  if (refused !== null) throw new GuideUploadError({ kind: "refused", code: refused });

  const form = new FormData();
  form.append("file", file);
  form.append("locale", locale);
  if (target.kind === "existing") form.append("guideId", target.guideId);
  else form.append("label", target.label);

  const response = await fetch(ADMIN_GUIDES_UPLOAD_PATH, { method: "POST", body: form });
  if (!response.ok) throw new GuideUploadError(await readUploadFailure(response));
  return parseJsonResponse(response, guideUploadResponse);
}

async function readUploadFailure(response: Response): Promise<GuideUploadFailure> {
  const body = guideUploadErrorBody.safeParse(await response.json().catch(() => null));
  if (body.success && body.data.code !== undefined) {
    return body.data.code === GUIDE_UPLOAD_DATABASE_REFUSAL
      ? { kind: "reason", reason: body.data.error }
      : { kind: "refused", code: body.data.code };
  }
  // The platform refuses a body over its own limit before the route runs,
  // with no JSON of ours to read.
  if (response.status === 413) return { kind: "refused", code: "too_large" };
  return { kind: "unknown" };
}
