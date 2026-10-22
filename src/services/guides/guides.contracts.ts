import { z } from "zod";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/constants/locales";

/**
 * Contracts for guides — PDFs Marketing hands out from landing pages, one
 * file per language, kept in one store.
 *
 * The writes are admin-guarded RPCs: the label and a file's removal run on the
 * admin's own session from the browser, while a file's upload goes through
 * the one server-side store function, since its bytes go to a private bucket
 * on the service-role client. The admin reads are plain table reads under the
 * admin policies; the public read is `list_landing_page_guides`, and the
 * download route's is `get_guide_download_files`.
 */

/** The private bucket guide files live in. No object in it has a public URL. */
export const GUIDES_BUCKET = "guides";

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

/**
 * The largest guide file the admin tab's upload route takes: 4 MB, the image
 * catalogue's cap, under Vercel's request body limit of about 4.5 MB. The
 * bucket and the database hold the same number.
 *
 * Both caps are accepted limits, left until they become a problem. A refusal
 * tells the admin to re-export the PDF smaller — Canva's "Compress file", or
 * Acrobat's "Reduce file size" — which is the whole of the remedy today.
 */
export const GUIDE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/**
 * The largest guide file the MCP view can send: the bytes travel base64 in
 * one JSON-RPC request, which the MCP SDK refuses over 4 MB, and base64 adds a
 * third, so about 2.9 MB of PDF leaves room for the rest of the request.
 * Accepted as it stands, like the cap above.
 */
export const GUIDE_MCP_UPLOAD_MAX_BYTES = 2_900_000;

/** The longest label a guide may have, as the database holds it. */
export const GUIDE_LABEL_MAX_LENGTH = 200;

/** The longest file name a guide file may be stored under, as the database holds it. */
export const GUIDE_FILE_NAME_MAX_LENGTH = 255;

// ---------------------------------------------------------------------------
// What an admin writes
// ---------------------------------------------------------------------------

/** A guide's label: what admins call it in their lists. Never shown to a reader. */
export const guideLabel = z
  .string()
  .trim()
  .min(1, "A guide needs a label")
  .max(GUIDE_LABEL_MAX_LENGTH, `A guide's label is at most ${GUIDE_LABEL_MAX_LENGTH} characters`);

export const guideLocale = z.enum(SUPPORTED_LOCALES);

// ---------------------------------------------------------------------------
// What the reads return
// ---------------------------------------------------------------------------

/** Who wrote to a guide, and through which AI app. */
export interface GuideSaver {
  /** The admin's name, or null when none is recorded (a migration, an account since removed). */
  by: string | null;
  /**
   * The AI app the write came through, or null when it was made in Sogverse
   * itself. `name` is what the app registered as, null once it is gone.
   */
  via: { clientId: string; name: string | null } | null;
}

/** One language's file of a guide, as the admin reads it. */
export interface AdminGuideFile {
  locale: SupportedLocale;
  fileName: string;
  byteSize: number;
  uploadedAt: string;
  uploaded: GuideSaver;
}

/**
 * One place a guide is offered: a landing page whose guide sections place it,
 * in its live copy, its working copy or both.
 */
export type GuideUsage = {
  pageId: string;
  /** The page's working titles, one per language it is written in; never empty. */
  titles: { locale: SupportedLocale; title: string }[];
  /** Whether readers see it there now: the published copy places it. */
  inLiveCopy: boolean;
  /** Whether the working copy places it, so the next publish keeps it there. */
  inWorkingCopy: boolean;
};

/** A guide as the admin pages and the MCP tools read it. */
export interface AdminGuide {
  id: string;
  label: string;
  /** Every file uploaded, in `SUPPORTED_LOCALES` order; never empty. */
  files: AdminGuideFile[];
  /** Every place it is offered; empty when it is offered nowhere. */
  usages: GuideUsage[];
  createdAt: string;
  created: GuideSaver;
  updatedAt: string;
  lastSaved: GuideSaver;
}

/** The file one reader downloads: their language's, by the reader fallback. */
export interface GuideDownload {
  locale: SupportedLocale;
  /** The object in the private `guides` bucket, read with the service role. */
  storagePath: string;
  /** What the download is offered as. */
  fileName: string;
  byteSize: number;
}

/** What `list_landing_page_guides` answers, written from its body. */
export const landingPageGuideRows = z.array(z.object({ guide_id: z.string().uuid() }));

/** What `get_guide_download_files` answers, written from its body. */
export const guideDownloadRows = z.array(
  z.object({
    locale: z.string(),
    storage_path: z.string(),
    file_name: z.string(),
    byte_size: z.number().int(),
  }),
);

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/**
 * What an admin is told when a guide write is refused. The database's
 * sentence is quoted where the code is one an admin can act on —
 * `check_violation` (no label, a label too long, removing the last file) and
 * `no_data_found` (the guide or the file is gone). Every other code carries a
 * message written for a developer, so it falls back to a generic line.
 */
export type GuideWriteFailure = { kind: "reason"; reason: string } | { kind: "unknown" };

const QUOTED_SQLSTATES: ReadonlySet<string> = new Set([
  "23514", // check_violation
  "P0002", // no_data_found
]);

export function guideWriteFailure(error: unknown): GuideWriteFailure {
  if (typeof error !== "object" || error === null) return { kind: "unknown" };
  if (!("code" in error) || !("message" in error)) return { kind: "unknown" };
  const { code, message } = error;
  if (typeof code !== "string" || typeof message !== "string") {
    return { kind: "unknown" };
  }
  if (!QUOTED_SQLSTATES.has(code) || message.length === 0) {
    return { kind: "unknown" };
  }
  return { kind: "reason", reason: message };
}

/** Why an upload was refused before anything was stored. */
export const GUIDE_UPLOAD_REFUSALS = ["empty", "too_large", "not_pdf", "label"] as const;

export type GuideUploadRefusalCode = (typeof GUIDE_UPLOAD_REFUSALS)[number];

/** An upload refused for a reason the admin can act on, with the sentence they read. */
export interface GuideUploadRefusal {
  code: GuideUploadRefusalCode;
  error: string;
}

/**
 * What the admin upload route (`POST /api/admin/guides`) answers once the file
 * is stored.
 */
export const guideUploadResponse = z.object({
  guideId: z.string().uuid(),
  /** Whether this upload created the guide. */
  created: z.boolean(),
  locale: guideLocale,
  fileName: z.string(),
  byteSize: z.number().int(),
  /** Whether it replaced a file the language already had. */
  replaced: z.boolean(),
});

export type GuideUploadResponse = z.infer<typeof guideUploadResponse>;

/**
 * The code a refused upload carries: one of the store's refusals, or
 * `refused` for a database refusal whose sentence is quoted in `error`.
 */
export const GUIDE_UPLOAD_DATABASE_REFUSAL = "refused";

/** The body the admin upload route refuses with. */
export const guideUploadErrorBody = z.object({
  error: z.string(),
  code: z.enum([...GUIDE_UPLOAD_REFUSALS, GUIDE_UPLOAD_DATABASE_REFUSAL]).optional(),
});
