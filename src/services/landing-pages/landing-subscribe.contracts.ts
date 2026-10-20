import { z } from "zod";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import { landingId } from "@/lib/landing-pages/sections";
import {
  realEmailValue,
  registrationUtmBody,
} from "@/services/users/parent-registration.contracts";

/**
 * The wire shapes of a landing page's email sign-up form and the route it
 * posts to (`POST /api/landing-pages/subscribe`).
 */

/** The longest first name the form passes on. */
export const LANDING_SUBSCRIBE_FIRST_NAME_MAX = 100;

/** The longest last name the form passes on. */
export const LANDING_SUBSCRIBE_LAST_NAME_MAX = 100;

/** An optional name: trimmed, and a blank one is the same as none. */
function optionalName(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((name) => (name === "" ? undefined : name));
}

/**
 * The honeypot field's name: an input no person sees or fills, so a body
 * carrying anything in it came from a bot filling every field it found. A
 * plausible name is the point — a field called `honeypot` would be skipped.
 */
export const LANDING_SUBSCRIBE_HONEYPOT = "website";

export const landingSubscribeBody = z.object({
  /** The live page the form is on. */
  pageId: landingId,
  /** The sign-up section on it, so the route can check the page still has it. */
  sectionId: landingId,
  /** The page's locale: the language the reader signed up in. */
  locale: z.enum(SUPPORTED_LOCALES),
  email: realEmailValue,
  firstName: optionalName(LANDING_SUBSCRIBE_FIRST_NAME_MAX),
  lastName: optionalName(LANDING_SUBSCRIBE_LAST_NAME_MAX),
  /** The consent box. The form will not post unticked, and the route refuses it. */
  consent: z.literal(true),
  /**
   * The honeypot. Taken as any string, so a filled one reaches the handler
   * and is answered like a real sign-up rather than refused with a 400 that
   * would tell the bot which field gave it away.
   */
  [LANDING_SUBSCRIBE_HONEYPOT]: z.string().optional(),
  /**
   * The UTM values this visit arrived with, unsanitised — the registration
   * body's own shape, for the same reason. Passed on only when the request's
   * consent cookie grants marketing (`src/lib/utm.ts`).
   */
  utm: registrationUtmBody.optional(),
});

export type LandingSubscribeBody = z.input<typeof landingSubscribeBody>;

/**
 * What the route answers on success, whether the address was new, already on
 * the list, or a bot's: the form says "you are signed up" either way, so the
 * answer cannot be used to learn who is subscribed.
 */
export const landingSubscribeResponse = z.object({ success: z.literal(true) });
