import { z } from "zod";
import { LANDING_PICTURE_SHAPES } from "../picture-shapes";
import {
  isWritten,
  landingId,
  markdownText,
  plainText,
  type LandingSectionDefinition,
} from "./shared";

/** Which side of the words a text section's picture sits on. */
export const LANDING_IMAGE_SIDES = ["start", "end"] as const;

/** A heading and a markdown body, with an optional picture beside them. */
const section = z
  .object({
    id: landingId,
    type: z.literal("text"),
    imageId: landingId.optional(),
    imageSide: z.enum(LANDING_IMAGE_SIDES),
  })
  .strict();

const text = z
  .object({
    eyebrow: plainText,
    heading: plainText,
    /** Authored markdown, rendered under its `markdownFields` entry's use case. */
    body: markdownText,
    imageAlt: plainText,
  })
  .strict();

export const textSection = {
  type: "text",
  label: "Text",
  section,
  text,
  missingText: (block, words) => [
    ...(isWritten(words.heading) ? [] : ["heading"]),
    ...(isWritten(words.body) ? [] : ["body"]),
    ...(block.imageId !== undefined && !isWritten(words.imageAlt)
      ? ["imageAlt"]
      : []),
  ],
  markdownFields: [{ field: "body", useCase: "landing" }],
  pictureShapes: LANDING_PICTURE_SHAPES,
} as const satisfies LandingSectionDefinition<"text", typeof section, typeof text>;
