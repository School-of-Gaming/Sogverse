import { z } from "zod";
import {
  buttonTarget,
  isWritten,
  landingId,
  plainText,
  type LandingSectionDefinition,
} from "./shared";

/** A closing ask: a heading, an optional line and a button. */
const section = z
  .object({
    id: landingId,
    type: z.literal("cta"),
    button: buttonTarget,
  })
  .strict();

const text = z
  .object({
    eyebrow: plainText,
    heading: plainText,
    body: plainText,
    buttonLabel: plainText,
  })
  .strict();

export const ctaSection = {
  type: "cta",
  label: "Call to action",
  section,
  text,
  missingText: (_block, words) => [
    ...(isWritten(words.heading) ? [] : ["heading"]),
    ...(isWritten(words.buttonLabel) ? [] : ["buttonLabel"]),
  ],
} as const satisfies LandingSectionDefinition<"cta", typeof section, typeof text>;
