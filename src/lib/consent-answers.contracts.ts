import { z } from "zod";
import { Constants } from "@/types/database.types";

/** One answer to the cookie banner, from the two purposes it asks about. */
export const consentAnswer = z.enum(Constants.public.Enums.consent_answer);

/**
 * The wire shape of `POST /api/consent-answers`: a device's first answer to the
 * cookie banner, to be counted.
 *
 *   - `answer` — which of the four answers was given.
 *   - `pagePath` — the raw path the address bar held, locale prefix and
 *     translated slug included, never a query. A claim the route vets: it is
 *     counted under its internal path only when it names a marketing page, and
 *     under no page otherwise.
 */
export const consentAnswerBody = z.object({
  answer: consentAnswer,
  pagePath: z.string().min(1).max(2048),
});

export type ConsentAnswerBody = z.infer<typeof consentAnswerBody>;

/**
 * What `consent_answer_totals` and `get_admin_consent_answer_totals` return,
 * written from their body: the answers counted over a range of UTC days, one
 * row per (page, answer). The generated type reads `page` as always a string;
 * NULL stands for every page that is not a marketing page.
 */
export const consentAnswerTotalsResult = z.array(
  z.object({
    page: z.string().nullable(),
    answer: consentAnswer,
    count: z.number().int().positive(),
  }),
);

export type ConsentAnswerTotals = z.infer<typeof consentAnswerTotalsResult>;
