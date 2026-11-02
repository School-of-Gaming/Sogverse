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
 * Alone of the types its picture is not in the structure but in each language's
 * words, beside its alt text: a hero picture can carry words baked into the
 * art, and it is that language's link-preview fallback. A language that names
 * none shows none. The picture is wide only: it is also the page's link preview
 * and the picture its structured data leads with, both drawn at 16:9. Alone of
 * the types it takes no background either: it opens the page on the page's own
 * ground, and its schema refuses the field.
 */
const section = z
  .object({
    id: landingId,
    type: z.literal("hero"),
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
    /** The subject line of the email the button opens, when it opens one. */
    emailSubject: plainText,
    /** This language's hero picture, a catalogue entry's id; absent, it shows none. */
    imageId: landingId.optional(),
    imageAlt: plainText,
  })
  .strict();

export const heroSection = {
  type: "hero",
  label: "Hero",
  sticky: false,
  section,
  text,
  missingText: (hero, words) => [
    ...(isWritten(words.headline) ? [] : ["headline"]),
    ...(hero.button !== undefined && !isWritten(words.buttonLabel)
      ? ["buttonLabel"]
      : []),
    ...(Object.hasOwn(words, "imageId") && !isWritten(words.imageAlt)
      ? ["imageAlt"]
      : []),
  ],
  markdownFields: [],
  pictureShapes: ["wide"],
} as const satisfies LandingSectionDefinition<"hero", typeof section, typeof text>;
