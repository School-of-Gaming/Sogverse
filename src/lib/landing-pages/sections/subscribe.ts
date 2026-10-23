import { z } from "zod";
import {
  isWritten,
  landingBackgroundField,
  landingId,
  plainText,
  type LandingSectionDefinition,
} from "./shared";

/**
 * An email sign-up form: a reader leaves their address, and optionally their
 * first and last name, to join the newsletter list in Klaviyo, single opt-in.
 *
 * **No shared field but the background every section takes.** The list a
 * reader joins is the deployment's configuration, the same for every page, so
 * nothing about it is the page's to choose. A later field naming what the
 * reader receives once signed up (a download, say) would be structure and
 * would join here.
 *
 * **The page writes the ask; the form's own words are ours.** The heading, the
 * intro and the button say why a reader would want to sign up from this page,
 * so they are written per language like every other section's. The field
 * labels, the consent sentence and every answer the form gives are fixed copy
 * in the message files: they are the same promise on every page, and the
 * consent sentence is what the reader is agreeing to.
 */
const section = z
  .object({
    id: landingId,
    type: z.literal("subscribe"),
    ...landingBackgroundField,
  })
  .strict();

const text = z
  .object({
    eyebrow: plainText,
    heading: plainText,
    intro: plainText,
    buttonLabel: plainText,
  })
  .strict();

export const subscribeSection = {
  type: "subscribe",
  label: "Email sign-up",
  section,
  text,
  missingText: (_section, words) => [
    ...(isWritten(words.heading) ? [] : ["heading"]),
    ...(isWritten(words.buttonLabel) ? [] : ["buttonLabel"]),
  ],
  markdownFields: [],
  pictureShapes: [],
} as const satisfies LandingSectionDefinition<"subscribe", typeof section, typeof text>;
