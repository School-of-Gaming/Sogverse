import { z } from "zod";
import {
  isWritten,
  landingBackgroundField,
  landingId,
  plainText,
  type LandingSectionDefinition,
} from "./shared";

/**
 * A guide from Marketing's store — a PDF, one file per language — offered for
 * download, with an optional cover picture.
 *
 * **The guide id and the picture are structure, never words**: the guide is
 * the same guide in every language, and each reader downloads its file in
 * their own language by the reader fallback, independent of the page version
 * shown. Whether the id is a guide at all is the database's to check when the
 * structure is saved. The picture is a catalogue entry like a hero's, wide
 * only, and the catalogue's replace and removal reach it the same way.
 *
 * **Its words are a required heading**, with an optional eyebrow and
 * description, and the picture's alt text, required when it has one. The SQL
 * half of the required-text rule names the same.
 */

const section = z
  .object({
    id: landingId,
    type: z.literal("guide"),
    guideId: landingId,
    imageId: landingId.optional(),
    ...landingBackgroundField,
  })
  .strict();

const text = z
  .object({
    eyebrow: plainText,
    heading: plainText,
    description: plainText,
    imageAlt: plainText,
  })
  .strict();

export const guideSection = {
  type: "guide",
  label: "Guide",
  section,
  text,
  missingText: (block, words) => [
    ...(isWritten(words.heading) ? [] : ["heading"]),
    ...(block.imageId !== undefined && !isWritten(words.imageAlt) ? ["imageAlt"] : []),
  ],
  markdownFields: [],
  pictureShapes: ["wide"],
} as const satisfies LandingSectionDefinition<"guide", typeof section, typeof text>;
