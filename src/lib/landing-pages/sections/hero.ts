import { z } from "zod";
import {
  buttonTarget,
  isWritten,
  landingId,
  plainText,
  type LandingSectionDefinition,
} from "./shared";

/**
 * The page's opening: its one H1, an optional line under it, an optional
 * picture and an optional button. Every page has exactly one, and it is first.
 */
const section = z
  .object({
    id: landingId,
    type: z.literal("hero"),
    imageId: landingId.optional(),
    button: buttonTarget.optional(),
  })
  .strict();

const text = z
  .object({
    eyebrow: plainText,
    /** The page's only H1. */
    headline: plainText,
    subline: plainText,
    buttonLabel: plainText,
    imageAlt: plainText,
  })
  .strict();

export const heroSection = {
  type: "hero",
  label: "Hero",
  section,
  text,
  missingText: (hero, words) => [
    ...(isWritten(words.headline) ? [] : ["headline"]),
    ...(hero.button !== undefined && !isWritten(words.buttonLabel)
      ? ["buttonLabel"]
      : []),
    ...(hero.imageId !== undefined && !isWritten(words.imageAlt)
      ? ["imageAlt"]
      : []),
  ],
  markdownFields: [],
} as const satisfies LandingSectionDefinition<"hero", typeof section, typeof text>;
