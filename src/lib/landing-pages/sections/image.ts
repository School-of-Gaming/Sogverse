import { z } from "zod";
import { LANDING_PICTURE_SHAPES } from "../picture-shapes";
import {
  distinctIds,
  fieldOf,
  isWritten,
  landingBackgroundField,
  landingId,
  plainText,
  type LandingSectionDefinition,
} from "./shared";

/** The most pictures an image section shows. */
export const IMAGE_SECTION_MAX_PICTURES = 4;

/**
 * One to four pictures of one shape, with an optional heading and caption.
 * Each picture is an item with an id of its own, so its alt text — one per
 * picture, per language — stays attached to it however the pictures are
 * reordered, replaced or removed.
 */
const section = z
  .object({
    id: landingId,
    type: z.literal("image"),
    ...landingBackgroundField,
    images: z
      .array(z.object({ id: landingId, imageId: landingId }).strict())
      .min(1, "An image section shows at least one picture")
      .max(IMAGE_SECTION_MAX_PICTURES, "An image section shows at most four pictures")
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
  markdownFields: [],
  pictureShapes: LANDING_PICTURE_SHAPES,
} as const satisfies LandingSectionDefinition<"image", typeof section, typeof text>;
