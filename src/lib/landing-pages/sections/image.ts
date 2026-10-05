import { z } from "zod";
import {
  distinctIds,
  fieldOf,
  isWritten,
  landingId,
  plainText,
  type LandingSectionDefinition,
} from "./shared";

/**
 * One to four pictures, with an optional heading and caption. Each picture is
 * an item with an id of its own, so its alt text — one per picture, per
 * language — stays attached to it however the pictures are reordered,
 * replaced or removed.
 */
const section = z
  .object({
    id: landingId,
    type: z.literal("image"),
    images: z
      .array(z.object({ id: landingId, imageId: landingId }).strict())
      .min(1, "An image section shows at least one picture")
      .max(4, "An image section shows at most four pictures")
      .refine(distinctIds, "Two pictures share an id"),
  })
  .strict();

const text = z
  .object({
    eyebrow: plainText,
    heading: plainText,
    caption: plainText,
    /** The alt text of each picture, by the picture item's id. */
    alts: z.record(z.string(), z.string().trim()).optional(),
  })
  .strict();

export const imageSection = {
  type: "image",
  label: "Pictures",
  section,
  text,
  missingText: (block, words) =>
    block.images
      .filter((image) => !isWritten(fieldOf(words.alts, image.id)))
      .map((image) => `alts.${image.id}`),
} as const satisfies LandingSectionDefinition<"image", typeof section, typeof text>;
