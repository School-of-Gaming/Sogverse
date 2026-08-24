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
import { MASCOT_SWATCHES, type ColorOverride } from "./palette";

/**
 * The species a default avatar can be, as (concept, form) pairs.
 *
 * This is deliberately *not* every concept. Ytymo has no head to crop to and
 * Konsu's screen face has one expression's worth of range, so neither makes a
 * good portrait; the families that survive a head-and-shoulders crop are the
 * people, the animals, the folds — and the one-eyed bean, which turns out to
 * be the best portrait in the set for the reason it was always going to be:
 * a bust crop of a fused body is mostly *eye*, and one eye at 28 pixels is
 * four times the pupil of two.
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
  { concept: "silmu", label: "Silmu" },
  { concept: "palikka", form: "trex", label: "Palikka — T-rex" },
  { concept: "palikka", form: "hippo", label: "Palikka — virtahepo" },
  { concept: "palikka", form: "hirvi", label: "Palikka — hirvi" },
  // Appended, never inserted — see the note at the top of the file. The
  // flat-yellow people are the best humanoid bust in the set: a bust crop of
  // a Porukka is a wide plain head, two wide-set eyes and one flat block of
  // hair, with nothing hairline on it to turn to mush at 28 pixels.
  { concept: "porukka", form: "kid-a", label: "Porukka — kid, mop" },
  { concept: "porukka", form: "kid-b", label: "Porukka — kid, crop" },
  { concept: "porukka", form: "teen-a", label: "Porukka — teen, long" },
  { concept: "porukka", form: "teen-b", label: "Porukka — teen, knot" },
  { concept: "porukka", form: "adult-a", label: "Porukka — adult, bob" },
  { concept: "porukka", form: "adult-b", label: "Porukka — adult, crop" },
  { concept: "porukka", form: "elder-a", label: "Porukka — elder, set" },
  { concept: "porukka", form: "elder-b", label: "Porukka — elder, beard" },
  // Appended, never inserted. The inked people are the best portrait in the
  // set for the reason the idiom exists: a bust crop is *all interior line* —
  // hair against a face, a collar against a neck, a frame against an eye — and
  // interior line is the one thing that reads at every size on this ground.
  // Rasterised at 28 pixels all four builds and all five colourways are still
  // nameable apart.
  { concept: "stadi", form: "kid", label: "Stadi — kid, mop" },
  { concept: "stadi", form: "teen", label: "Stadi — teen, long" },
  { concept: "stadi", form: "adult", label: "Stadi — adult, swept" },
  { concept: "stadi", form: "elder", label: "Stadi — elder, white" },
  // Appended, never inserted. The gem is in the list for the opposite reason
  // to everything above it: its bust crop is not a good portrait of a person,
  // it is the company's own mark with a face in it, and at 28 pixels that is
  // the most recognisable tile in the set — one flat colour in a shape the
  // viewer has already seen in their browser tab.
  { concept: "jalo", label: "Jalo" },
  // Appended, never inserted. The forest folk portrait on their silhouettes
  // alone: at 28 pixels the pen line is a third of a pixel and has stopped
  // existing, so what is left is the wash shape and the two pupils — which is
  // enough, because the six forms were designed as silhouettes first. The
  // hedgehog's bust needed the widest crop in the set (its `head.r` frames the
  // whole mound rather than its face) or it came out as a plain rectangle.
  { concept: "metsa", form: "siili", label: "Metsä — siili" },
  { concept: "metsa", form: "hiiri", label: "Metsä — hiiri" },
  { concept: "metsa", form: "pollo", label: "Metsä — pöllö" },
  { concept: "metsa", form: "haltija", label: "Metsä — haltija" },
  { concept: "metsa", form: "tonttu", label: "Metsä — tonttu" },
  { concept: "metsa", form: "kettu", label: "Metsä — kettu" },
  // Appended, never inserted. The villagers portrait better than their
  // proportion suggests they should: a four-heads-tall figure has a small
  // head, but the bust window is 3.6 head-radii wide, so a small head means a
  // *tight* window and the face fills it. Rasterised at 64, 40 and 28 all six
  // are still nameable apart, and what does it is the ear line — folded
  // flaps, sharp triangles, forward triangles, sideways ellipses under horns, a
  // comb, and two circles wider than the skull — plus the coat colour under it.
  { concept: "kyla", form: "dog", label: "Kylä — koira" },
  { concept: "kyla", form: "cat", label: "Kylä — kissa" },
  { concept: "kyla", form: "pig", label: "Kylä — possu" },
  { concept: "kyla", form: "goat", label: "Kylä — vuohi" },
  { concept: "kyla", form: "rooster", label: "Kylä — kukko" },
  { concept: "kyla", form: "mouse", label: "Kylä — hiiri" },
  // Appended, never inserted. The dragons portrait on two marks a bust crop
  // cannot lose: the horn pair breaking the top of the frame, and the muzzle
  // breaking the bottom of the skull. Both are silhouette rather than
  // colour, so all three ages survive 28 pixels; what does *not* survive is
  // telling the grown one from the elder, whose difference is a pale beard
  // frill that is sub-pixel there. They are all three in the list anyway —
  // an avatar has to be recognisable, not classifiable.
  { concept: "lohi", form: "kid", label: "Lohi — poikanen" },
  { concept: "lohi", form: "grown", label: "Lohi — aikuinen" },
  { concept: "lohi", form: "old", label: "Lohi — vanhus" },
  // Appended, never inserted. Fruit and fungus are the best 28-pixel portraits
  // in the set after the bean, for the same reason it is: a bust crop of a
  // fused body is nearly all body, so what fills the tile is one saturated
  // block of colour in a shape. Rasterised at 28 all nine are nameable apart —
  // the star on the bilberry, the lobes on the cloudberry, the crown on the
  // strawberry, and three cap silhouettes over one cream stem.
  //
  // The generator pairs a form with any of that species' colourways, which
  // here means it will occasionally draw a red bilberry or a brown chanterelle.
  // That is deliberate rather than a defect: an avatar is somebody's face, not
  // a botany plate, and the odd wrong-coloured berry is exactly the kind of
  // variety this list exists to produce.
  { concept: "marja", form: "mustikka", label: "Marja — mustikka" },
  { concept: "marja", form: "puolukka", label: "Marja — puolukka" },
  { concept: "marja", form: "lakka", label: "Marja — lakka" },
  { concept: "marja", form: "mansikka", label: "Marja — mansikka" },
  { concept: "sieni", form: "kantarelli", label: "Sieni — kantarelli" },
  { concept: "sieni", form: "tatti", label: "Sieni — tatti" },
  { concept: "sieni", form: "karpassieni", label: "Sieni — kärpässieni" },
  // Appended, never inserted. The crew portraits on three marks and only
  // three: the cranium's outline, two whites set wide and low inside it, and
  // one pale ball off the top-right corner. Rasterised at 64 / 40 / 28 all six
  // skins are nameable apart and the antenna survives every one of them,
  // because it is the only thing in the tile that breaks the head's own edge.
  //
  // The three builds are in the list knowing that at 28 pixels they are one
  // silhouette — proportion is exactly the axis a portrait crop throws away.
  // They separate from about 40 up (the engineer's brow is a third wider than
  // the navigator's), and the species was always going to be told apart by
  // colour rather than by build, which is what the ruling asks of it.
  { concept: "galaksi", form: "pilot", label: "Galaksi — luotsi" },
  { concept: "galaksi", form: "navigator", label: "Galaksi — suunnistaja" },
  { concept: "galaksi", form: "engineer", label: "Galaksi — insinööri" },
  // Appended, never inserted. The three cute animals are the first forms of
  // the animal family to be added here since the original seven, and they earn
  // it on the same axis the villagers did — one landmark each that a bust crop
  // cannot lose. The penguin's hood-over-face split is the strongest portrait
  // in the whole family: two blocks, a hard edge between them and a pink beak
  // on the join, all of it above the collar. The hedgehog's scalloped arch
  // frames the face the way the mound frames the forest hedgehog's, and its
  // small `head.r` makes the bust window tight enough to hold the arch. The
  // otter is the one that needed checking, because it portraits three inches
  // from the beaver: rasterised at 64 / 40 / 28 beside it they stay apart on
  // the ear line and the coat — two dark nubs high on a round skull against
  // two pale-lined nubs low on a wide one, in a mahogany against a timber —
  // and what actually separates them at full length, the tail, is out of frame
  // in a bust. It is in the list because an avatar has to be recognisable
  // rather than classifiable, and "the dark brown one with the little ears" is
  // a thing a person can say.
  { concept: "otso", form: "penguin", label: "Pingviini" },
  { concept: "otso", form: "otter", label: "Saukko" },
  { concept: "otso", form: "hedgehog", label: "Siili" },
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
  "swept-cap",
  "sprout",
  "beret",
  "painter-cap",
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
 * Garment colours: the product's own swatch list, in its own order.
 *
 * This used to be nine hand-picked hexes that lived only here, which meant a
 * gamer picking an avatar colour and a gamer picking a voice-zone colour were
 * choosing from two different palettes that nearly matched — the worst of both
 * options. It is now `MASCOT_SWATCHES`: the sixteen voice-zone hues, the four
 * Yty elements and the four admin product types, all already tuned to read on
 * the dark ground and all already meaningful somewhere else in the app.
 *
 * **The append-only rule has moved with the list.** It now binds
 * `MASCOT_SWATCHES` (and, upstream of it, `VOICE_ZONE_COLOR_KEYS`), because
 * that is where reordering would silently reassign every default avatar. This
 * one reset was free and will not be again: nothing stores an avatar yet, so
 * there is no user whose face changed. See the note in the report about
 * storing a swatch *id* rather than a hex, which is the change that would make
 * a future retune of a zone hue survivable.
 */
export const AVATAR_CLOTHING: readonly string[] = MASCOT_SWATCHES.map((s) => s.hex);

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
  // Appended, never inserted: the three coats the cute-animal round brought
  // with it. They have to be here or the forms above cannot be drawn in the
  // colours that identify them — a penguin's landmark is a *dark* hood over a
  // *pale* face, and honey, frost and berry are each two pale tones with
  // nothing to separate them.
  //
  // The generator picks form and colourway independently, so it will also
  // paint a honey penguin and a slate bear. That is the same trade the berries
  // and the mushrooms already take, and the same answer: an avatar is somebody's
  // face rather than a field guide. It is worth naming that it costs more here
  // — a wrong-coloured bilberry is still obviously a bilberry, and a penguin
  // without its two blocks is just a bird with a pale face — and that the fix,
  // if it is ever wanted, is a per-figure colourway list rather than a
  // per-concept one.
  otso: ["honey", "frost", "berry", "pingviini", "saukko", "siili"],
  taitto: ["prism", "aurora", "ember"],
  kaari: ["prism", "aurora", "ember"],
  kide: ["prism", "aurora", "ember"],
  nappi: ["prism", "aurora", "ember"],
  // The one-eyed bean is painted from the shared swatch table rather than from
  // colourways of its own, so its list is that table plus the faithful black.
  // Deriving it rather than transcribing it keeps the two from drifting, and
  // the append-only rule that governs the list has moved with it, onto
  // `MASCOT_SWATCHES` — where `AVATAR_CLOTHING` already put it.
  silmu: ["musta", ...MASCOT_SWATCHES.map((s) => s.id)],
  palikka: ["oliivi", "violetti", "ruska", "sammal", "routa"],
  porukka: ["noki", "ruis", "kupari", "usva", "puola"],
  stadi: ["taivas", "tiili", "okra", "paperi", "ratikka"],
  // The gem is painted from the same shared swatch table the bean is, ahead
  // of it the two brand pairs — so its list is derived the same way, and the
  // append-only rule that governs it is `MASCOT_SWATCHES`'s.
  jalo: ["jalo", "secondary", ...MASCOT_SWATCHES.map((s) => s.id)],
  // The wash colourways only. `hamara` — the inverted register, a pale nib on
  // a body barely above the page — is deliberately absent: it is the one
  // colourway in this species that has no silhouette, and an avatar is nothing
  // but silhouette.
  metsa: ["kuu", "sammal", "puolukka", "usva", "tuohi", "havu"],
  lohi: ["lohi", "koski", "virta", "nuotio", "kaisla"],
  marja: ["mustikka", "puolukka", "lakka", "mansikka", "vadelma"],
  sieni: ["kantarelli", "vahvero", "tatti", "karpassieni"],
  galaksi: ["revontuli", "komeetta", "tahtisumu", "plasma", "kiertorata", "syvyys"],
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
