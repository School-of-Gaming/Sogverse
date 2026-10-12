import { z } from "zod";
import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";

/**
 * Contracts for spotlights — admin-written notes appended, with a picture, to
 * every session report email.
 *
 * There is no API route here: the writes are admin-guarded RPCs the admin's
 * own session calls, and the reads are plain table reads — under the admin
 * policy for the admin pages, and on the service role for the session report
 * route. The picture is an entry of the shared image catalogue
 * (`src/services/catalogue-images/`) of purpose `spotlight_image`: a spotlight
 * saves the entry's id, and the database derives the served path.
 *
 * **A spotlight's text is per language.** Each version is a title and a
 * markdown body in one site locale, both required. Versions are listed in
 * `SUPPORTED_LOCALES` order everywhere, so the reader fallback's last step —
 * the first version written — is the same answer on every surface.
 */

// ---------------------------------------------------------------------------
// What an admin writes
// ---------------------------------------------------------------------------

/** One language version as an admin saves it. */
export const spotlightVersionInput = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  title: z.string().trim().min(1, "Every language version needs a title"),
  /** Authored markdown. */
  body: z.string().trim().min(1, "Every language version needs a body"),
});

export type SpotlightVersionInput = z.input<typeof spotlightVersionInput>;

/**
 * A spotlight as an admin saves it — the same fields on a create and on every
 * save, written together in one statement, so whether it is enabled is judged
 * against the picture the same save leaves it with.
 *
 * `versions` is the whole set, replacing what is stored: a language left out
 * is removed. At least one, each with a title and a body. `imageId` is
 * required-**nullable** rather than optional, because the save assigns it on
 * every call and an omitted picture is how one is cleared — demanding the
 * field keeps a clearing deliberate. `enabled` is whether it is appended to
 * session report emails; the database refuses it with no picture.
 */
export const spotlightInput = z.object({
  versions: z
    .array(spotlightVersionInput)
    .min(1, "A spotlight needs at least one language version")
    .refine(
      (versions) =>
        new Set(versions.map((version) => version.locale)).size ===
        versions.length,
      "Each language may have one version",
    ),
  imageId: z.string().uuid("Not a catalogue picture").nullable(),
  enabled: z.boolean(),
});

export type SpotlightInput = z.input<typeof spotlightInput>;

// ---------------------------------------------------------------------------
// What the reads return
// ---------------------------------------------------------------------------

/** One language version of a spotlight. */
export interface SpotlightVersion {
  locale: SupportedLocale;
  title: string;
  /** Authored markdown: links allowed, no headings. */
  body: string;
}

/** A spotlight as the admin pages read it. */
export interface AdminSpotlight {
  id: string;
  /** Every version written, in `SUPPORTED_LOCALES` order; never empty. */
  versions: SpotlightVersion[];
  /** The picture's catalogue entry, or null for none. */
  imageId: string | null;
  /**
   * The picture's path in the `spotlight-images` bucket, derived by the
   * database from `imageId` — resolve it with `catalogueImageSrc` as a
   * `spotlight_image`. Null exactly when there is no picture.
   */
  imagePath: string | null;
  /** The catalogue's name for the picture's entry. Null exactly when there is no picture. */
  imageLabel: string | null;
  /** Whether it is appended to session report emails. Never true without a picture. */
  enabled: boolean;
  createdAt: string;
}

/**
 * An enabled spotlight as a session report email reads it: everything needed
 * to draw it in any reader's locale. Pick the version with
 * `resolveTranslation(spotlight.versions, locale)`.
 */
export interface EnabledSpotlight {
  id: string;
  /** Every version written, in `SUPPORTED_LOCALES` order; never empty. */
  versions: SpotlightVersion[];
  image: {
    /** The picture's public URL, which a mail client fetches with a bare GET. */
    url: string;
    /**
     * The stored size in pixels. Every spotlight picture is stored at exactly
     * its purpose's size, which the upload routes enforce, so this is that
     * size rather than a measurement.
     */
    width: number;
    height: number;
  };
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/**
 * What an admin is told when a spotlight write is refused. The database's
 * sentence is quoted where the code is one an admin can act on —
 * `check_violation` (no version, a version missing its title or body, a
 * picture of another purpose, or switching on a spotlight with no picture),
 * `no_data_found` (the spotlight is gone) and `foreign_key_violation` (the
 * picture left the catalogue). Every other code carries a message written for
 * a developer, so it falls back to a generic line.
 */
export type SpotlightWriteFailure =
  | { kind: "reason"; reason: string }
  | { kind: "unknown" };

const QUOTED_SQLSTATES: ReadonlySet<string> = new Set([
  "23514", // check_violation
  "P0002", // no_data_found
  "23503", // foreign_key_violation
]);

export function spotlightWriteFailure(error: unknown): SpotlightWriteFailure {
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
