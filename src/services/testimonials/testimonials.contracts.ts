import { z } from "zod";
import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";

/**
 * Contracts for testimonials — real words from real parents, gamers and gedus,
 * kept in one store by Marketing.
 *
 * There is no API route here: the writes are admin-guarded RPCs the admin's
 * own session calls, the admin reads are plain table reads under the admin
 * policies, and the public read is `list_landing_page_testimonials`.
 *
 * **A testimonial's words are per language.** Each version says whom the
 * quote is from (`from`, stored as `attribution`, since FROM is SQL's own
 * word) and the quote, both required. Versions are listed in
 * `SUPPORTED_LOCALES` order everywhere a list of them is shown.
 */

// ---------------------------------------------------------------------------
// Quotation marks
// ---------------------------------------------------------------------------

/**
 * The marks a stored quote may not start or end with, because the page wraps
 * every quote in its reader's locale's own: double marks straight and curly,
 * low marks, guillemets, the single typographic marks other than the
 * apostrophe, and corner brackets. The apostrophes (`'` and `’`) are not here:
 * a word may start or end with one, and Klingon writes a letter with it. The
 * database's CHECK and its writers' refusal name the same marks, and a DB test
 * holds the two lists to one answer.
 */
export const QUOTATION_MARKS = "\"“”„‟«»‹›‘‚‛「」『』";

/** Whether a quote, once trimmed, starts or ends with a quotation mark. */
export function hasQuotationMarks(quote: string): boolean {
  const trimmed = quote.trim();
  if (trimmed === "") return false;
  return (
    QUOTATION_MARKS.includes(trimmed[0]) ||
    QUOTATION_MARKS.includes(trimmed[trimmed.length - 1])
  );
}

// ---------------------------------------------------------------------------
// What an admin writes
// ---------------------------------------------------------------------------

const NO_MARKS =
  "Leave the quotation marks out: the site adds them in each language's own style";

/** One language version as an admin saves it. */
export const testimonialVersionInput = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  from: z.string().trim().min(1, "Every language version needs to say whom the quote is from"),
  quote: z
    .string()
    .trim()
    .min(1, "Every language version needs its quote")
    .refine((quote) => !hasQuotationMarks(quote), NO_MARKS),
});

export type TestimonialVersionInput = z.input<typeof testimonialVersionInput>;

/**
 * A testimonial as an admin saves it whole: the whole version set, replacing
 * what is stored — a language left out is removed. At least one version.
 */
export const testimonialInput = z.object({
  versions: z
    .array(testimonialVersionInput)
    .min(1, "A testimonial needs at least one language version")
    .refine(
      (versions) =>
        new Set(versions.map((version) => version.locale)).size ===
        versions.length,
      "Each language may have one version",
    ),
});

export type TestimonialInput = z.input<typeof testimonialInput>;

// ---------------------------------------------------------------------------
// What the reads return
// ---------------------------------------------------------------------------

/** One language version of a testimonial. */
export interface TestimonialVersion {
  locale: SupportedLocale;
  /** Whom the quote is from, as the admin attributes it ("Mum, Finland"). */
  from: string;
  /** The words, without quotation marks: the page adds its reader's. */
  quote: string;
}

/**
 * One place a testimonial is shown: a landing page whose testimonials
 * sections place it, in its live copy, its working copy or both. A placement
 * only in the working copy reaches readers at the next publish, and one only
 * in the live copy leaves them at it.
 */
export type TestimonialUsage = {
  pageId: string;
  /** The page's working titles, one per language it is written in; never empty. */
  titles: { locale: SupportedLocale; title: string }[];
  /** Whether readers see it there now: the published copy places it. */
  inLiveCopy: boolean;
  /** Whether the working copy places it, so the next publish keeps it there. */
  inWorkingCopy: boolean;
};

/** Who wrote to a testimonial, and through which AI app. */
export interface TestimonialSaver {
  /** The admin's name, or null when none is recorded (a migration, an account since removed). */
  by: string | null;
  /**
   * The AI app the write came through, or null when it was made in Sogverse
   * itself. `name` is what the app registered as, null once it is gone.
   */
  via: { clientId: string; name: string | null } | null;
}

/** A testimonial as the admin pages and the MCP tools read it. */
export interface AdminTestimonial {
  id: string;
  /** Every version written, in `SUPPORTED_LOCALES` order; never empty. */
  versions: TestimonialVersion[];
  /** Every place it is shown; empty when it is shown nowhere. */
  usages: TestimonialUsage[];
  createdAt: string;
  created: TestimonialSaver;
  updatedAt: string;
  lastSaved: TestimonialSaver;
}

/** A placed testimonial as the public pages read it: its words, nothing about who keeps it. */
export interface PublicTestimonial {
  id: string;
  /** Every version written, in `SUPPORTED_LOCALES` order; never empty. */
  versions: TestimonialVersion[];
}

/** What `list_landing_page_testimonials` answers, written from its body. */
export const landingPageTestimonialRows = z.array(
  z.object({
    testimonial_id: z.string().uuid(),
    versions: z.array(
      z.object({
        locale: z.string(),
        attribution: z.string(),
        quote: z.string(),
      }),
    ),
  }),
);

/**
 * What `get_oauth_client` answers, narrowed to what naming an AI app needs.
 * No row at all means the app is no longer registered.
 */
export const oauthClientNameRows = z.array(
  z.object({ client_name: z.string().nullable() }),
);

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/**
 * What an admin is told when a testimonial write is refused. The database's
 * sentence is quoted where the code is one an admin can act on —
 * `check_violation` (no version, a version missing whom it is from or its
 * quote, a quote in quotation marks, removing the last version) and
 * `no_data_found` (the testimonial or the version is gone). Every other code
 * carries a message written for a developer, so it falls back to a generic
 * line.
 */
export type TestimonialWriteFailure =
  | { kind: "reason"; reason: string }
  | { kind: "unknown" };

const QUOTED_SQLSTATES: ReadonlySet<string> = new Set([
  "23514", // check_violation
  "P0002", // no_data_found
]);

export function testimonialWriteFailure(error: unknown): TestimonialWriteFailure {
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
