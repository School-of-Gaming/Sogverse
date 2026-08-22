/**
 * The wire shape of a stored mascot avatar.
 *
 * Written to the repo's `*.contracts.ts` pattern so that the day this becomes
 * real, the API route parses a request body with `avatarBody` and the service
 * parses the response with the same schema — one definition, both ends.
 *
 * ## Why this is validated on the server and not merely typed
 *
 * An avatar is an identity claim. The site already treats it that way in the
 * one place it matters: the voice-token route refuses to let a caller name the
 * user id whose identicon should be drawn, because a caller that could would
 * be able to appear as somebody else in a room. A customised avatar has
 * exactly that shape — if the renderer takes its instructions from whatever
 * the client sends, a participant list is trivially spoofable.
 *
 * So the rules this schema exists to enforce are:
 *
 * - **A viewer never supplies another user's avatar.** The server reads it
 *   from that user's row. This schema validates the *owner's* write, not a
 *   reader's request.
 * - **Only the customisable slots exist here.** There is no `bodyTop`, no
 *   `pupil`, no species accent — the identity core is not a colour a user gets
 *   to pick, and the way to guarantee that is for the vocabulary to have no
 *   word for it.
 * - **Every enum is closed.** Species, form, colourway and worn items are all
 *   checked against the tables in `avatar.ts`, so a stored value can never
 *   name an accessory that does not exist or a hex colour off the list. A free
 *   colour field would be the obvious next request and should be refused: an
 *   avatar is drawn on a dark surface and an unconstrained picker produces a
 *   great many invisible ones.
 *
 * The whole thing is small enough to be one `jsonb` column with a CHECK, which
 * is the intended home.
 */

import { z } from "zod";

import {
  AVATAR_ACCENTS,
  AVATAR_CLOTHING,
  AVATAR_FACES,
  AVATAR_FIGURES,
  AVATAR_HATS,
  AVATAR_VARIANTS,
} from "./avatar";

/** Every `concept:form` pair a stored avatar may name, as literal strings. */
const FIGURE_KEYS = AVATAR_FIGURES.map((f) => `${f.concept}:${f.form ?? ""}`);

/** Torso and extra items that read at portrait sizes. Deliberately short. */
export const AVATAR_TORSOS = ["", "hoodie", "tee", "scarf"] as const;

const nonEmpty = <T extends string>(values: readonly T[]): [string, ...string[]] => {
  const list = values.filter((v) => v !== "");
  return [list[0], ...list.slice(1)];
};

export const avatarSchema = z
  .object({
    concept: z.enum(nonEmpty(AVATAR_FIGURES.map((f) => f.concept))),
    form: z.string().max(24).optional(),
    variant: z.string().max(24),
    colors: z.object({
      clothing: z.enum(nonEmpty(AVATAR_CLOTHING)),
      clothingAccent: z.enum(nonEmpty(AVATAR_ACCENTS)),
    }),
    outfit: z.object({
      hat: z.enum(nonEmpty(AVATAR_HATS)).optional(),
      face: z.enum(nonEmpty(AVATAR_FACES)).optional(),
      torso: z.enum(nonEmpty(AVATAR_TORSOS)).optional(),
    }),
  })
  // Species and form are checked together rather than separately: "kaveri"
  // and "bear" are each individually valid and the pair is nonsense, and a
  // renderer handed a nonsense pair silently falls back to a default, which is
  // the kind of wrong that never gets noticed.
  .refine((value) => FIGURE_KEYS.includes(`${value.concept}:${value.form ?? ""}`), {
    message: "Unknown species and build combination",
    path: ["form"],
  })
  .refine(
    (value) => (AVATAR_VARIANTS[value.concept] ?? []).includes(value.variant),
    { message: "Colourway does not belong to this species", path: ["variant"] },
  );

export type AvatarBody = z.infer<typeof avatarSchema>;

/** What a `PUT /api/me/avatar` would take. The user is the session, never a field. */
export const avatarBody = z.object({ avatar: avatarSchema });
