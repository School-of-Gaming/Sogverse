/**
 * Mascot avatars — a replacement for the identicon, and the data shape a
 * gamer-facing customiser would store.
 *
 * ## The problem with the identicon
 *
 * The current avatar is a five-by-five mirrored pixel grid in amber, purple
 * and white on black, seeded from a user's UUID. It is deterministic, it is
 * unique, and it fails the only test that matters: **at a glance, in a list of
 * names, you cannot tell who is who.** Twenty-five cells with three colours
 * gives plenty of mathematical variety and almost no *memorable* variety,
 * because a human does not remember "the one with a gap in the third row". A
 * human remembers "the fox" and "the one in the red beanie".
 *
 * So the axes here are chosen to be nameable rather than numerous. A default
 * avatar is a **species, a build, a colourway and up to two worn items**, and
 * any two of them differ in something a person could say out loud.
 *
 * ## The mapping is a promise
 *
 * `avatarFromId` is a pure function of the user's id, and it must stay one.
 * The same id gives the same avatar forever, on every device, with no stored
 * state — which is what lets a brand-new account have a face before it has a
 * preference, and what lets a customiser be an *override* of a default rather
 * than a thing every user is forced through.
 *
 * That makes the tables below load-bearing: **reordering `AVATAR_FIGURES` or
 * any of the option lists silently reassigns every existing user's default
 * avatar.** Append, never insert, and never sort.
 *
 * ## Where the customisation has to live
 *
 * Not in the client. The avatar a viewer sees must come from the server's
 * record of that user, exactly as the voice-token route already refuses to let
 * a caller name the UUID whose identicon it wants. A customised avatar is an
 * identity claim: if a client can hand the renderer "draw me as this user's
 * avatar", it can impersonate that user in every participant list on the site.
 * The shape below is small enough to be one JSON column and is validated
 * server-side by `avatar.contracts.ts`.
 */

import type { ConceptId } from "./concept";
import type { DetailLevel } from "./detail";
import type { Outfit } from "./outfit";
import type { ColorOverride } from "./palette";

/**
 * The species a default avatar can be, as (concept, form) pairs.
 *
 * This is deliberately *not* every concept. Ytymo has no head to crop to and
 * Konsu's screen face has one expression's worth of range, so neither makes a
 * good portrait; the three families that survive a head-and-shoulders crop are
 * the people, the animals and the folds.
 *
 * APPEND ONLY — see the note at the top of the file.
 */
export type AvatarFigure = { concept: ConceptId; form?: string; label: string };

export const AVATAR_FIGURES: readonly AvatarFigure[] = [
  { concept: "kaveri", form: "kid-a", label: "Kaveri — long hair" },
  { concept: "kaveri", form: "kid-b", label: "Kaveri — short crop" },
  { concept: "kaveri", form: "kid-c", label: "Kaveri — tuft" },
  { concept: "kaveri", form: "adult-a", label: "Kaveri — adult, long hair" },
  { concept: "kaveri", form: "adult-b", label: "Kaveri — adult, short hair" },
  { concept: "kaveri", form: "adult-c", label: "Kaveri — adult, bob" },
  { concept: "otso", form: "bear", label: "Karhu" },
  { concept: "otso", form: "fox", label: "Kettu" },
  { concept: "otso", form: "moose", label: "Hirvi" },
  { concept: "otso", form: "owl", label: "Pöllö" },
  { concept: "otso", form: "lynx", label: "Ilves" },
  { concept: "otso", form: "hare", label: "Jänis" },
  { concept: "otso", form: "seal", label: "Norppa" },
  { concept: "taitto", label: "Taitto" },
  { concept: "kaari", label: "Kaari" },
  { concept: "kide", label: "Kide" },
  { concept: "nappi", label: "Nappi" },
];

/**
 * Hats a 28-pixel portrait can actually carry. Chunky silhouette items only —
 * anything hairline is three grey pixels at that size and makes the face
 * harder to read rather than easier.
 *
 * The empty string means "nothing", and it is in the list so that roughly a
 * fifth of users get a bare head; an avatar set where everybody is wearing
 * something is as monotonous as one where nobody is.
 *
 * APPEND ONLY.
 */
export const AVATAR_HATS = [
  "",
  "beanie",
  "headset",
  "earflap-hat",
  "sunhat",
  "party-hat",
  "flower-crown",
  "student-cap",
] as const;

/**
 * Face items. Present in the vocabulary and, honestly, **not legible at 28
 * pixels** — a pair of specs there is two dark smudges over two dark eyes. They
 * earn their place because they read clearly from about 40 pixels up, and
 * because a customiser that offers nothing for the face is a poorer toy.
 *
 * APPEND ONLY.
 */
export const AVATAR_FACES = ["", "specs", "shades"] as const;

/**
 * Garment colours. Nine hues far enough apart to be named — "the red one",
 * "the green one" — rather than nine points on a gradient.
 *
 * These are illustration colours in the mascot palette's carve-out, not theme
 * tokens: an avatar is a drawing that has to survive being rendered into an
 * email where no CSS custom property exists.
 *
 * APPEND ONLY.
 */
export const AVATAR_CLOTHING = [
  "#E5484D",
  "#F2A93B",
  "#F6C744",
  "#4FB477",
  "#2AB6A6",
  "#3E8FD6",
  "#7C5CE0",
  "#D95BA6",
  "#8C6A4F",
] as const;

/** The trim, kept light so it always reads against the garment. */
export const AVATAR_ACCENTS = ["#FFF7EA", "#FFE0A3", "#CFE8FF", "#FFD3E4", "#D8F5D0"] as const;

/** What a stored avatar is. A strict subset of what `<Mascot>` already takes. */
export type MascotAvatar = {
  concept: ConceptId;
  form?: string;
  variant: string;
  /** Only the two garment slots — the identity core is not customisable. */
  colors: { clothing: string; clothingAccent: string };
  outfit: Outfit;
};

/**
 * Every colourway id an avatar may name, per concept. Kept here rather than
 * read off the concept definitions because the validator has to run on a
 * server that has no business importing React components.
 */
export const AVATAR_VARIANTS: Record<string, readonly string[]> = {
  kaveri: ["lilac", "teal", "coral"],
  otso: ["honey", "frost", "berry"],
  taitto: ["prism", "aurora", "ember"],
  kaari: ["prism", "aurora", "ember"],
  kide: ["prism", "aurora", "ember"],
  nappi: ["prism", "aurora", "ember"],
};

/**
 * A stable 32-bit hash of the id's hex digits.
 *
 * Deliberately not "take the first bytes and modulo them", which is what the
 * identicon does and which is why identicons cluster: consecutive UUIDs from
 * the same generator share more entropy in some byte positions than others.
 * Mixing the whole string and then pulling *different bit ranges* for
 * different axes keeps the species, the colour and the hat independent, so two
 * users who happen to draw the same species still differ everywhere else.
 */
function hashOf(id: string): number {
  const hex = id.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  let h = 0x811c9dc5;
  for (const char of hex) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Pull `bits` bits out of the hash starting at `offset`, as an index. */
function slice(hash: number, offset: number, bits: number, size: number): number {
  const mask = (1 << bits) - 1;
  return ((hash >>> offset) & mask) % size;
}

/**
 * The default avatar for a user id. Pure, stable, and the same everywhere.
 *
 * A second, differently-seeded hash drives the two colour slots so that the
 * palette is not correlated with the species — otherwise every fox is red and
 * the set loses half its variety.
 */
export function avatarFromId(userId: string): MascotAvatar {
  const h = hashOf(userId);
  const g = hashOf(`${userId}:palette`);

  const figure = AVATAR_FIGURES[slice(h, 0, 16, AVATAR_FIGURES.length)];
  const variants = AVATAR_VARIANTS[figure.concept] ?? ["default"];
  const hat = AVATAR_HATS[slice(h, 11, 8, AVATAR_HATS.length)];
  const face = AVATAR_FACES[slice(h, 21, 6, AVATAR_FACES.length)];

  const outfit: Outfit = {};
  if (hat !== "") outfit.hat = hat;
  if (face !== "") outfit.face = face;

  return {
    concept: figure.concept,
    ...(figure.form === undefined ? {} : { form: figure.form }),
    variant: variants[slice(h, 5, 8, variants.length)],
    colors: {
      clothing: AVATAR_CLOTHING[slice(g, 0, 12, AVATAR_CLOTHING.length)],
      clothingAccent: AVATAR_ACCENTS[slice(g, 13, 8, AVATAR_ACCENTS.length)],
    },
    outfit,
  };
}

/** The colour override a stored avatar turns into. */
export function avatarColors(avatar: MascotAvatar): ColorOverride {
  return { clothing: avatar.colors.clothing, clothingAccent: avatar.colors.clothingAccent };
}

/**
 * How much detail a portrait gets at a given rendered size.
 *
 * Not the same thresholds as a full-body mascot, and that is the point: a bust
 * crop is a viewBox window about three and a half times tighter than the full
 * figure, so a 40-pixel portrait draws the head at roughly the size a
 * 140-pixel full body would. Handing it the full-body thresholds throws away
 * the highlights and the muzzle crease at exactly the sizes an avatar is
 * actually used at.
 */
export function avatarDetail(size: number): DetailLevel {
  if (size < 24) return "icon";
  if (size < 44) return "simple";
  return "full";
}
