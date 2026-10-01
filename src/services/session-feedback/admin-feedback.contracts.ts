import { z } from "zod";
import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { Constants, type ProductType } from "@/types";

/**
 * Who answered, and through which channel. One question asked two ways is two
 * instruments, so a source is what keeps a gamer's own answer from ever being
 * averaged with a parent's answer about the same session.
 *
 * Only `gamer_online` is collected today. The admin page reads every figure
 * per source, so a new instrument (a parent's answer from the report mail, a
 * gamer's answer about an in-person session) joins as a new member here and a
 * new reader of its own table, without reshaping what the page already draws.
 */
export const FEEDBACK_SOURCES = ["gamer_online"] as const;

export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

/** How a Gedu stood at the session an answer is about. */
export type AdminFeedbackGeduRole = "primary" | "assistant" | "substitute";

export interface AdminFeedbackGedu {
  id: string;
  name: string;
  role: AdminFeedbackGeduRole;
}

/** The product and group a session belongs to. */
export interface AdminFeedbackGroupRef {
  groupId: string;
  groupName: string;
  productId: string;
  productName: string;
  productType: ProductType;
  isRemote: boolean;
}

/**
 * One respondent's answer about one session.
 *
 * `answers` carries the stored item keys as they are, including keys the
 * source's catalogue has since retired: the reader ignores what it does not
 * know, exactly as the column's own comment says. A response with no rating
 * and no note is never sent.
 */
export interface AdminFeedbackResponse extends AdminFeedbackGroupRef {
  source: FeedbackSource;
  /** The session's day in its product's timezone, `YYYY-MM-DD`. */
  sessionDate: string;
  respondent: { id: string; name: string };
  /** Every Gedu expected at that session; empty when none can be resolved. */
  gedus: AdminFeedbackGedu[];
  answers: Record<string, number>;
  note: string;
  /** When the response was last saved — the last Done wins. */
  submittedAt: string;
}

/**
 * One session that could have produced responses for a source, with how many
 * could have answered. The denominator of the response rate: for
 * `gamer_online` it is every recorded online session in the range, with its
 * gamers marked present.
 */
export interface AdminFeedbackSession extends AdminFeedbackGroupRef {
  source: FeedbackSource;
  sessionDate: string;
  eligibleCount: number;
  gedus: AdminFeedbackGedu[];
}

/** Everything the admin feedback page draws, for one inclusive range of session days. */
export interface AdminFeedbackDataset {
  from: string;
  to: string;
  responses: AdminFeedbackResponse[];
  sessions: AdminFeedbackSession[];
}

/**
 * Runtime contract for `get_admin_session_feedback`, written from its body.
 * The generated type is `Json`, so this schema is the structure, and the db
 * test parses real Postgres output through it.
 *
 * The wire differs from the interfaces above in one field: a product's name is
 * per locale in the database, so every entry carries the product's whole
 * translations array, and {@link adminFeedbackDatasetFromRpc} names it in the
 * reader's locale.
 */
const productTranslation = z.object({ locale: z.string(), name: z.string() });

const adminFeedbackGedu = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["primary", "assistant", "substitute"]),
}) satisfies z.ZodType<AdminFeedbackGedu>;

const wireEntry = {
  source: z.enum(FEEDBACK_SOURCES),
  groupId: z.string(),
  groupName: z.string(),
  productId: z.string(),
  productTranslations: z.array(productTranslation),
  productType: z.enum(Constants.public.Enums.product_type),
  isRemote: z.boolean(),
  sessionDate: z.string(),
  gedus: z.array(adminFeedbackGedu),
};

export const adminFeedbackRpcResult = z.object({
  responses: z.array(
    z.object({
      ...wireEntry,
      respondent: z.object({ id: z.string(), name: z.string() }),
      answers: z.record(z.string(), z.number()),
      note: z.string(),
      submittedAt: z.string(),
    }),
  ),
  sessions: z.array(
    z.object({
      ...wireEntry,
      eligibleCount: z.number().int().nonnegative(),
    }),
  ),
});

export type AdminFeedbackRpcResult = z.infer<typeof adminFeedbackRpcResult>;

type ProductTranslation = z.infer<typeof productTranslation>;

/** One wire entry with its translations array swapped for the resolved name. */
function withProductName<T extends { productTranslations: ProductTranslation[] }>(
  entry: T,
  locale: SupportedLocale,
): Omit<T, "productTranslations"> & { productName: string } {
  const { productTranslations, ...rest } = entry;
  // Every product holds at least one translation, so the fallback is defensive.
  const productName = resolveTranslation(productTranslations, locale)?.name ?? "";
  return { ...rest, productName };
}

/**
 * The RPC's document as the page's dataset, every product named in `locale`
 * by the fallback every product name follows (the locale, then English, then
 * the first translation present).
 */
export function adminFeedbackDatasetFromRpc(
  raw: unknown,
  range: { from: string; to: string },
  locale: SupportedLocale,
): AdminFeedbackDataset {
  const parsed = adminFeedbackRpcResult.parse(raw);
  return {
    from: range.from,
    to: range.to,
    responses: parsed.responses.map((entry) => withProductName(entry, locale)),
    sessions: parsed.sessions.map((entry) => withProductName(entry, locale)),
  };
}
