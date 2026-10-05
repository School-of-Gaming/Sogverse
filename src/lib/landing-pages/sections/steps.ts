import { z } from "zod";
import {
  distinctIds,
  entryOf,
  isWritten,
  landingId,
  plainText,
  type LandingSectionDefinition,
} from "./shared";

/** Two to six numbered steps, each a title and a short body. */
const section = z
  .object({
    id: landingId,
    type: z.literal("steps"),
    items: z
      .array(z.object({ id: landingId }).strict())
      .min(2, "A steps section has at least two steps")
      .max(6, "A steps section has at most six steps")
      .refine(distinctIds, "Two steps share an id"),
  })
  .strict();

const text = z
  .object({
    eyebrow: plainText,
    heading: plainText,
    intro: plainText,
    /** Each step's words, by the step's id. */
    items: z
      .record(z.string(), z.object({ title: plainText, body: plainText }).strict())
      .optional(),
  })
  .strict();

export const stepsSection = {
  type: "steps",
  label: "Steps",
  section,
  text,
  missingText: (block, words) => [
    ...(isWritten(words.heading) ? [] : ["heading"]),
    ...block.items.flatMap((item) => {
      const entry = entryOf(words.items, item.id);
      return [
        ...(isWritten(entry.title) ? [] : [`items.${item.id}.title`]),
        ...(isWritten(entry.body) ? [] : [`items.${item.id}.body`]),
      ];
    }),
  ],
  markdownFields: [],
} as const satisfies LandingSectionDefinition<"steps", typeof section, typeof text>;
