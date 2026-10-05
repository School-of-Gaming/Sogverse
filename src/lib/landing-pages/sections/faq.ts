import { z } from "zod";
import {
  distinctIds,
  entryOf,
  isWritten,
  landingId,
  markdownText,
  plainText,
  type LandingSectionDefinition,
} from "./shared";

/**
 * One to twenty questions and answers. Its SEO contribution is a `FAQPage`,
 * so the words a reader sees are the words the structured data states.
 */
const section = z
  .object({
    id: landingId,
    type: z.literal("faq"),
    items: z
      .array(z.object({ id: landingId }).strict())
      .min(1, "A questions section has at least one question")
      .max(20, "A questions section has at most twenty questions")
      .refine(distinctIds, "Two questions share an id"),
  })
  .strict();

const text = z
  .object({
    eyebrow: plainText,
    heading: plainText,
    /** Each question and its answer (authored markdown), by the item's id. */
    items: z
      .record(
        z.string(),
        z.object({ question: plainText, answer: markdownText }).strict(),
      )
      .optional(),
  })
  .strict();

export const faqSection = {
  type: "faq",
  label: "Questions and answers",
  section,
  text,
  missingText: (block, words) => [
    ...(isWritten(words.heading) ? [] : ["heading"]),
    ...block.items.flatMap((item) => {
      const entry = entryOf(words.items, item.id);
      return [
        ...(isWritten(entry.question) ? [] : [`items.${item.id}.question`]),
        ...(isWritten(entry.answer) ? [] : [`items.${item.id}.answer`]),
      ];
    }),
  ],
} as const satisfies LandingSectionDefinition<"faq", typeof section, typeof text>;
