import "server-only";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/api-error";
import type { SupportedLocale } from "@/lib/constants/locales";
import { IMMUTABLE_CACHE_CONTROL } from "@/lib/images/ingest-image.server";
import type { AppSupabaseClient } from "@/types";
import {
  GUIDE_FILE_NAME_MAX_LENGTH,
  GUIDES_BUCKET,
  guideLabel,
  type GuideUploadRefusal,
} from "./guides.contracts";

/**
 * The one way a guide file is stored, shared by the admin tab's upload route
 * and the MCP upload tool because they are the same operation with different
 * callers.
 *
 * It takes both clients as arguments rather than constructing either, as the
 * image catalogue's store does: the route-posture registry pins every file
 * that reaches for the service-role client, and a shared helper constructing
 * one would be an unpinned site. The bytes go to the private bucket on the
 * service-role client — the bucket's one writer — while the guide's rows are
 * written by the admin-guarded functions on the caller's own session, so the
 * database decides who may store a guide exactly as it does in the browser.
 */

/** A file starts with this when it is a PDF at all. */
const PDF_MAGIC = "%PDF-";

/** Which guide a file goes to: one already stored, or a new one with its label. */
export type GuideTarget = { kind: "existing"; guideId: string } | { kind: "new"; label: string };

export interface StoreGuideFileArgs {
  /** The caller's own session client — the guide writers are admin-guarded. */
  db: AppSupabaseClient;
  /** The service-role client, used for the bucket and nothing else. */
  admin: AppSupabaseClient;
  bytes: Uint8Array;
  /** The name the file was uploaded under; a download is offered as it. */
  fileName: string;
  target: GuideTarget;
  locale: SupportedLocale;
  /**
   * The largest file this caller can carry: `GUIDE_UPLOAD_MAX_BYTES` for the
   * upload route, `GUIDE_MCP_UPLOAD_MAX_BYTES` for the MCP view.
   */
  maxBytes: number;
}

export type StoreGuideFileResult =
  | {
      status: "stored";
      guideId: string;
      /** Whether this upload created the guide. */
      created: boolean;
      locale: SupportedLocale;
      fileName: string;
      byteSize: number;
      /** Whether it replaced a file the locale already had. */
      replaced: boolean;
    }
  | { status: "refused"; refusal: GuideUploadRefusal };

const MB = 1024 * 1024;

function megabytes(bytes: number): string {
  return `${(bytes / MB).toFixed(1).replace(/\.0$/, "")} MB`;
}

/**
 * What is wrong with a file before anything is stored, or null: it is empty,
 * over the caller's cap, or not a PDF by its first bytes. The size refusal
 * names the remedy, which is the whole of the handling a too-large file gets.
 */
export function guideFileRefusal(bytes: Uint8Array, maxBytes: number): GuideUploadRefusal | null {
  if (bytes.byteLength === 0) {
    return { code: "empty", error: "The file is empty" };
  }
  if (bytes.byteLength > maxBytes) {
    return {
      code: "too_large",
      error: `A guide's file must be ${megabytes(maxBytes)} or smaller; this one is ${megabytes(bytes.byteLength)}. Export the PDF smaller — Canva's "Compress file" or Acrobat's "Reduce file size" — and upload it again.`,
    };
  }
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, PDF_MAGIC.length));
  if (head !== PDF_MAGIC) {
    return { code: "not_pdf", error: "That file is not a PDF. A guide is a PDF file." };
  }
  return null;
}

/**
 * The name a file is stored under: the last segment of whatever the client
 * sent, trimmed and capped, or a plain fallback when nothing is left.
 */
export function guideFileName(provided: string): string {
  const base = provided.split(/[\\/]/).pop()?.trim() ?? "";
  return (base === "" ? "guide.pdf" : base).slice(0, GUIDE_FILE_NAME_MAX_LENGTH);
}

/**
 * The `Content-Disposition` a guide's file is served with — `attachment` for a
 * reader's download, `inline` for an admin opening it in a tab: an ASCII
 * `filename` any browser reads, and the name as uploaded in `filename*` for
 * the browsers that read that.
 *
 * The stored name is whatever the admin's file was called, so it may carry a
 * quote, a semicolon or a non-ASCII byte, any of which in a plain `filename`
 * is a header a browser may read as two parameters. The fallback turns every
 * such character into an underscore, and both forms always end in `.pdf`.
 */
export function guideContentDisposition(type: "attachment" | "inline", fileName: string): string {
  const name = /\.pdf$/i.test(fileName) ? fileName : `${fileName}.pdf`;
  const ascii = name.replace(/[^A-Za-z0-9._ -]/g, "_");
  // RFC 5987: encodeURIComponent leaves `'()*!` bare, and `'` delimits the
  // extended value's parts.
  const encoded = encodeURIComponent(name).replace(
    /['()*!]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Store one language's file of a guide, creating the guide when the target
 * is a new one. Every upload is a fresh object at
 * `<guide id>/<locale>/<random uuid>.pdf`, so a replaced file never serves its
 * old bytes from any cache; the object it replaces is deleted once the
 * database has let go of it. When the database refuses the write, the object
 * just uploaded is deleted and the refusal is thrown as the database raised
 * it, for the caller's refusal reader (`guideWriteFailure`).
 */
export async function storeGuideFile({
  db,
  admin,
  bytes,
  fileName,
  target,
  locale,
  maxBytes,
}: StoreGuideFileArgs): Promise<StoreGuideFileResult> {
  const refused = guideFileRefusal(bytes, maxBytes);
  if (refused) return { status: "refused", refusal: refused };

  let label: string | null = null;
  if (target.kind === "new") {
    const parsed = guideLabel.safeParse(target.label);
    if (!parsed.success) {
      return {
        status: "refused",
        refusal: { code: "label", error: parsed.error.issues[0]?.message ?? "A guide needs a label" },
      };
    }
    label = parsed.data;
  }

  const guideId = target.kind === "existing" ? target.guideId.toLowerCase() : randomUUID();
  const name = guideFileName(fileName);
  const path = `${guideId}/${locale}/${randomUUID()}.pdf`;
  const bucket = admin.storage.from(GUIDES_BUCKET);

  const { error: uploadError } = await bucket.upload(path, bytes, {
    contentType: "application/pdf",
    upsert: false,
    cacheControl: IMMUTABLE_CACHE_CONTROL,
  });
  if (uploadError) {
    console.error("[guides] upload failed", uploadError);
    throw new ApiError(`The guide could not be uploaded: ${uploadError.message}`, 500);
  }

  const written =
    label !== null
      ? await db.rpc("create_guide", {
          p_id: guideId,
          p_label: label,
          p_locale: locale,
          p_storage_path: path,
          p_file_name: name,
          p_byte_size: bytes.byteLength,
        })
      : await db.rpc("save_guide_file", {
          p_id: guideId,
          p_locale: locale,
          p_storage_path: path,
          p_file_name: name,
          p_byte_size: bytes.byteLength,
        });

  if (written.error) {
    const { error: cleanupError } = await bucket.remove([path]);
    if (cleanupError) console.error("[guides] refused upload's object was not deleted", cleanupError);
    throw written.error;
  }

  // create_guide answers the id; save_guide_file the path it replaced, if any.
  const replacedPath = label === null && typeof written.data === "string" ? written.data : null;
  if (replacedPath !== null) {
    const { error: removeError } = await bucket.remove([replacedPath]);
    if (removeError) console.error("[guides] replaced object was not deleted", removeError);
  }

  return {
    status: "stored",
    guideId,
    created: label !== null,
    locale,
    fileName: name,
    byteSize: bytes.byteLength,
    replaced: replacedPath !== null,
  };
}
