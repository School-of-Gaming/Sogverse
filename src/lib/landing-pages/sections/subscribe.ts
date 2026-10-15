import { z } from "zod";
import {
  isWritten,
  landingId,
  plainText,
  type LandingSectionDefinition,
} from "./shared";

/**
 * An email sign-up form: a reader leaves their address, and their first name if
 * they like, to join the mailing list, which Brevo confirms by double opt-in.
 *
 * **No shared field.** The list a reader joins and the confirmation mail they
 * are sent are the deployment's configuration, the same for every page, so
 * nothing about them is the page's to choose. A later field naming what the
 * reader receives once they confirm (a download, say) would be structure and
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
} as const satisfies LandingSectionDefinition<"subscribe", typeof section, typeof text>;
