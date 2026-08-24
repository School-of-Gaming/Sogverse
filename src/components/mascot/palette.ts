/**
 * Every colour the mascot art is allowed to use, in one place.
 *
 * The repo forbids hardcoded colours in UI code, and this module is the
 * deliberate carve-out for illustration: a character's palette is part of the
 * drawing, not part of the theme, and the same SVG has to render inside an
 * email and on a marketing image where no CSS custom property exists. The
 * carve-out is only worth anything if it stays in one file — so no mascot
 * component anywhere may write a colour literal. It imports a colourway from
 * here, or it does without.
 *
 * Where a mascot colour IS a brand colour it comes from the real constant
 * rather than a copy that happens to match today.
 */

import { BRAND, PRODUCT_TYPE_COLOR, YTY_ELEMENT, ZONE_HUE } from "@/lib/constants/colors";
import { VOICE_ZONE_COLOR_KEYS } from "@/lib/constants/voice-zones";

/**
 * The linework and face neutrals shared by every concept. Kept out of the
 * colourways because they never vary: a character that re-tints its own
 * outline stops looking like the same character.
 */
export const MASCOT_INK = {
  /** Outlines, pupils, and the inside of an open mouth. */
  line: "#241B33",
  /** A softer second line weight — folds, seams, muzzle creases. */
  lineSoft: "#4A3A63",
  /** Warm off-white. Eye whites, sign faces, page shapes. */
  paper: "#FFF7EA",
  /** The ground shadow. Darker than the darkest app surface so it reads on one. */
  shadow: "#050505",
  /**
   * Dark plastic. Every device a character holds is moulded out of this rather
   * than out of the character's own colourway — a controller tinted to match a
   * mint blob is a mint controller on a mint belly, which is no controller at
   * all. Only the buttons and keys take the character's accent, which is
   * enough to keep the object part of the same illustration.
   */
  device: "#39324D",
  deviceLight: "#514868",
} as const;

/**
 * One character's colours. Every concept fills the same nine slots, which is
 * what lets a pose sheet be re-tinted without touching a single path.
 */
export type Colorway = {
  /** The silhouette's main fill. */
  bodyTop: string;
  /** The lower/second plane of the silhouette — belly, underside, back facet. */
  bodyBottom: string;
  /** Arms and legs. */
  limb: string;
  /** The large inset surface: screen, belly patch, muzzle, hood, inner fold. */
  panel: string;
  /** The one loud colour — antenna ball, element glyph, scarf, badge trim. */
  accent: string;
  /** A third colour, used sparingly, for facets and highlights. */
  spark: string;
  /** Eye whites. On a screen face this is the glow the eyes are drawn in. */
  sclera: string;
  /** Pupils. On a screen face this is the dark screen behind them. */
  pupil: string;
  /**
   * The line colour the face's *drawn* parts take — brows and the mouth glyph.
   *
   * Optional, and omitted by every colourway whose body is light enough for
   * the shared ink to read on: the face renderer falls back to
   * `MASCOT_INK.line`, which is what a character that never sets this has
   * always been drawn with.
   *
   * It exists because a near-black body has no such colour. The legacy SOG
   * mascot drew its mouth as a *light* shape cut out of a black blob, and any
   * concept dark enough to need that has to be able to say so — inverting the
   * ink is the only way a glyph mouth survives on a dark silhouette, and it is
   * still one flat shape with no interior, so the face grammar is untouched.
   */
  ink?: string;
  /**
   * Cheek blush.
   *
   * **Nothing live uses this any more.** Blush is a realism cue, and the
   * round-three face is a system of flat symbols with no realism cues on it at
   * all. The slot survives only because the two comparison face renderers on
   * the exploration page have to keep drawing what they drew, and it should be
   * deleted from this type in the same change that deletes them.
   */
  blush: string;
  /** The main garment colour — what a hoodie, tee, scarf or hat is dyed. */
  clothing: string;
  /** The garment's trim: a cuff, a pom, a stripe, a badge face. */
  clothingAccent: string;
};

/** A named colourway, with the label the playground shows for it. */
export type VariantDef = {
  id: string;
  label: string;
  /** One line on why this colourway exists — shown under the swatch. */
  note: string;
  colors: Colorway;
};

// --- Ytymo: the four Yty elements, one creature each ----------------------

/**
 * The element colours are the product's own (`YTY_ELEMENT`), so a Ytymo
 * standing beside the Yty section on the home page is literally the same hue
 * the section already spends. Everything around them — the deeper underside,
 * the pale accent — is mixed off that one value rather than chosen freely.
 */
const YTYMO_FACE = {
  sclera: MASCOT_INK.paper,
  pupil: MASCOT_INK.line,
} as const;

export const YTYMO_VARIANTS: readonly VariantDef[] = [
  {
    id: "harmony",
    label: "Harmony",
    note: "Your relationship with yourself",
    colors: {
      bodyTop: YTY_ELEMENT.harmony,
      bodyBottom: "#12A978",
      limb: "#2BBD8B",
      panel: "#A7F3D0",
      accent: "#DFFBEE",
      spark: "#0E7C58",
      ...YTYMO_FACE,
      blush: "#FF9BB0",
      clothing: BRAND.primary,
      clothingAccent: MASCOT_INK.paper,
    },
  },
  {
    id: "glow",
    label: "Glow",
    note: "Your relationship with others",
    colors: {
      bodyTop: YTY_ELEMENT.glow,
      bodyBottom: "#DE8C06",
      limb: "#F5A814",
      panel: "#FDE9A9",
      accent: "#FFF7DC",
      spark: "#A85F00",
      ...YTYMO_FACE,
      blush: "#FF8F6E",
      clothing: BRAND.secondary,
      clothingAccent: MASCOT_INK.paper,
    },
  },
  {
    id: "valor",
    label: "Valor",
    note: "Your relationship with the world",
    colors: {
      bodyTop: YTY_ELEMENT.valor,
      bodyBottom: "#DE3357",
      limb: "#F4536F",
      panel: "#FEC9D2",
      accent: "#FFEAEE",
      spark: "#9E1F3C",
      ...YTYMO_FACE,
      blush: "#FF7C9A",
      clothing: BRAND.primary,
      clothingAccent: MASCOT_INK.paper,
    },
  },
  {
    id: "wit",
    label: "Wit",
    note: "Your relationship with media & tech",
    colors: {
      bodyTop: YTY_ELEMENT.wit,
      bodyBottom: "#7C4FF0",
      limb: "#9470F7",
      panel: "#DDD0FE",
      accent: "#F1EAFF",
      spark: "#5326B5",
      ...YTYMO_FACE,
      blush: "#FF9BC8",
      clothing: BRAND.primary,
      clothingAccent: MASCOT_INK.paper,
    },
  },
];

// --- Konsu: the console bot ----------------------------------------------

/**
 * A screen face inverts the two eye slots: `sclera` is the glow the pixels are
 * lit in and `pupil` is the dark panel behind them. The colourway shape is the
 * same so one `Face` renderer serves both kinds of head.
 */
export const KONSU_VARIANTS: readonly VariantDef[] = [
  {
    id: "amber",
    label: "Amber",
    note: "Brand primary as the lit colour",
    colors: {
      bodyTop: "#4A4468",
      bodyBottom: "#332E4C",
      limb: "#5D5680",
      panel: "#161A2B",
      accent: BRAND.primary,
      spark: "#FFD98A",
      sclera: BRAND.primary,
      pupil: "#0D101B",
      blush: "#FF8F6E",
      clothing: BRAND.primary,
      clothingAccent: "#FFF0C6",
    },
  },
  {
    id: "violet",
    label: "Violet",
    note: "Brand secondary as the lit colour",
    colors: {
      bodyTop: "#3B3556",
      bodyBottom: "#2A2540",
      limb: "#4E4670",
      panel: "#12101F",
      accent: BRAND.secondary,
      spark: "#C77DFF",
      sclera: "#C77DFF",
      pupil: "#0B0914",
      blush: "#FF7CC4",
      clothing: BRAND.secondary,
      clothingAccent: "#EBD6FF",
    },
  },
  {
    id: "mint",
    label: "Mint",
    note: "A cool third chassis for contrast tests",
    colors: {
      bodyTop: "#2F4257",
      bodyBottom: "#22303F",
      limb: "#3E566F",
      panel: "#0E1720",
      accent: "#3DD9C4",
      spark: "#8FF7E8",
      sclera: "#5FF0DA",
      pupil: "#07120F",
      blush: "#6EE7F5",
      clothing: "#3DD9C4",
      clothingAccent: "#E4FFFA",
    },
  },
];

// --- Otso: the bear cub ---------------------------------------------------

export const OTSO_VARIANTS: readonly VariantDef[] = [
  {
    id: "honey",
    label: "Honey",
    note: "The default cub — warm, forest, Finnish",
    colors: {
      bodyTop: "#EFA93C",
      bodyBottom: "#D3811C",
      limb: "#E39A2F",
      panel: "#FFE1AE",
      accent: BRAND.secondary,
      spark: "#FFF2D6",
      sclera: MASCOT_INK.paper,
      pupil: MASCOT_INK.line,
      blush: "#FF9A80",
      clothing: BRAND.secondary,
      clothingAccent: "#FFF2D6",
    },
  },
  {
    id: "frost",
    label: "Frost",
    note: "Winter cub — the seasonal repaint",
    colors: {
      bodyTop: "#9BC8E8",
      bodyBottom: "#6FA3CC",
      limb: "#8CBCE0",
      panel: "#E5F2FB",
      accent: BRAND.primary,
      spark: "#FFFFFF",
      sclera: MASCOT_INK.paper,
      pupil: MASCOT_INK.line,
      blush: "#FFA8B8",
      clothing: "#2F6FA8",
      clothingAccent: "#FFFFFF",
    },
  },
  {
    id: "berry",
    label: "Berry",
    note: "The loud one — proves the cub takes any hue",
    colors: {
      bodyTop: "#C87FD6",
      bodyBottom: "#9E4FB0",
      limb: "#BB70CB",
      panel: "#F6DFF9",
      accent: YTY_ELEMENT.harmony,
      spark: "#FBEFFD",
      sclera: MASCOT_INK.paper,
      pupil: MASCOT_INK.line,
      blush: "#FF86A8",
      clothing: "#0E7C58",
      clothingAccent: "#F6DFF9",
    },
  },
];

// --- Kaveri: the stylised person -----------------------------------------

/**
 * Deliberately unreal complexions. This is the concept that stands where a
 * child would stand in marketing, so the one thing it must never do is look
 * like a photograph of a particular child — a lilac, a teal and a coral read
 * instantly as illustration, and nobody has to decide whose skin got drawn.
 */
export const KAVERI_VARIANTS: readonly VariantDef[] = [
  {
    id: "lilac",
    label: "Lilac",
    note: "Purple-forward — brand secondary hoodie",
    colors: {
      bodyTop: "#D6BBF5",
      bodyBottom: "#B694E0",
      limb: "#2F2A47",
      panel: "#B558F0",
      accent: BRAND.secondary,
      spark: BRAND.primary,
      sclera: MASCOT_INK.paper,
      pupil: MASCOT_INK.line,
      blush: "#FF93B4",
      clothing: BRAND.primary,
      clothingAccent: "#FFF0C6",
    },
  },
  {
    id: "teal",
    label: "Teal",
    note: "Cool complexion, amber accent",
    colors: {
      bodyTop: "#9FE3D8",
      bodyBottom: "#71C4B7",
      limb: "#23303B",
      panel: "#3FCADD",
      accent: "#1F97A8",
      spark: BRAND.primary,
      sclera: MASCOT_INK.paper,
      pupil: MASCOT_INK.line,
      blush: "#FF9A8B",
      clothing: BRAND.primary,
      clothingAccent: "#FFF0C6",
    },
  },
  {
    id: "coral",
    label: "Coral",
    note: "Warm complexion, purple accent",
    colors: {
      bodyTop: "#FFB4A2",
      bodyBottom: "#E8917C",
      limb: "#33263A",
      panel: "#F5849A",
      accent: "#E0567B",
      spark: BRAND.secondary,
      sclera: MASCOT_INK.paper,
      pupil: MASCOT_INK.line,
      blush: "#FF7F94",
      clothing: BRAND.secondary,
      clothingAccent: "#EBD6FF",
    },
  },
];

// --- Taitto: the folded-paper being --------------------------------------

export const TAITTO_VARIANTS: readonly VariantDef[] = [
  {
    id: "prism",
    label: "Prism",
    note: "The brand pair plus a pink fold",
    colors: {
      bodyTop: BRAND.primary,
      bodyBottom: "#C4780A",
      limb: BRAND.secondary,
      panel: "#FF6B9D",
      accent: "#FFF0C2",
      spark: "#B144FF",
      sclera: MASCOT_INK.paper,
      pupil: MASCOT_INK.line,
      blush: "#FF7FA8",
      clothing: BRAND.secondary,
      clothingAccent: "#FFF0C2",
    },
  },
  {
    id: "aurora",
    label: "Aurora",
    note: "Revontulet — the northern-lights fold",
    colors: {
      bodyTop: YTY_ELEMENT.harmony,
      bodyBottom: "#149C74",
      limb: "#38BDF8",
      panel: YTY_ELEMENT.wit,
      accent: "#E6FFF6",
      spark: "#7DD3FC",
      sclera: MASCOT_INK.paper,
      pupil: MASCOT_INK.line,
      blush: "#8DE8FF",
      clothing: "#38BDF8",
      clothingAccent: "#E6FFF6",
    },
  },
  {
    id: "ember",
    label: "Ember",
    note: "The hot fold — rose into amber",
    colors: {
      bodyTop: YTY_ELEMENT.valor,
      bodyBottom: "#D62E52",
      limb: BRAND.primary,
      panel: "#F472B6",
      accent: "#FFE7EE",
      spark: "#FFC862",
      sclera: MASCOT_INK.paper,
      pupil: MASCOT_INK.line,
      blush: "#FF7F9E",
      clothing: BRAND.primary,
      clothingAccent: "#FFE7EE",
    },
  },
];

// --- The shared swatch list ----------------------------------------------

/**
 * The colours the product already owns, offered to the mascot art as one list.
 *
 * Round three's colourways were each invented in place: a concept picked a
 * hue it liked and mixed four more off it by eye. That is how a fleet ends up
 * with five purples that are all *nearly* the app's purple, and it throws away
 * something the product has already done properly three times over. There are
 * exactly three families of categorical colour in this codebase, all of them
 * already tuned to read as a glyph on the #121212 ground:
 *
 * - the **sixteen voice-zone hues**, an even sweep of the wheel that a gamer
 *   already picks from when they name a zone;
 * - the **four Yty elements**, the piece of iconography this product owns
 *   outright;
 * - the **four admin product-type hues**, placed to clear the state colours.
 *
 * Twenty-four named colours is more than a fleet needs, and every one of them
 * is a colour a user can already meet somewhere else in the app. So a mascot
 * colourway now starts from a swatch and mixes off it, rather than starting
 * from a hex somebody typed.
 *
 * The hexes live in `@/lib/constants/colors` rather than here, because the
 * CSS tokens they mirror are the source of truth and the mirror belongs next
 * to the other mirrors.
 */
export type SwatchSource = "zone" | "yty" | "product";

export type MascotSwatch = {
  /** Stable id — the zone key, the element id, or the product-type slug. */
  id: string;
  label: string;
  hex: string;
  source: SwatchSource;
};

const ZONE_SWATCH_LABELS: Record<string, string> = {
  red: "Red",
  orange: "Orange",
  amber: "Amber",
  yellow: "Yellow",
  lime: "Lime",
  green: "Green",
  emerald: "Emerald",
  teal: "Teal",
  cyan: "Cyan",
  sky: "Sky",
  blue: "Blue",
  indigo: "Indigo",
  violet: "Violet",
  purple: "Purple",
  fuchsia: "Fuchsia",
  pink: "Pink",
};

export const MASCOT_SWATCHES: readonly MascotSwatch[] = [
  ...VOICE_ZONE_COLOR_KEYS.map((key) => ({
    id: key,
    label: ZONE_SWATCH_LABELS[key] ?? key,
    hex: ZONE_HUE[key],
    source: "zone" as const,
  })),
  { id: "harmony", label: "Harmony", hex: YTY_ELEMENT.harmony, source: "yty" },
  { id: "glow", label: "Glow", hex: YTY_ELEMENT.glow, source: "yty" },
  { id: "valor", label: "Valor", hex: YTY_ELEMENT.valor, source: "yty" },
  { id: "wit", label: "Wit", hex: YTY_ELEMENT.wit, source: "yty" },
  {
    id: "consumer-club",
    label: "Club cyan",
    hex: PRODUCT_TYPE_COLOR.consumerClub,
    source: "product",
  },
  {
    id: "municipality-club",
    label: "Kunta magenta",
    hex: PRODUCT_TYPE_COLOR.municipalityClub,
    source: "product",
  },
  { id: "camp", label: "Camp lime", hex: PRODUCT_TYPE_COLOR.camp, source: "product" },
  { id: "event", label: "Event indigo", hex: PRODUCT_TYPE_COLOR.event, source: "product" },
];

const SWATCH_BY_ID = new Map(MASCOT_SWATCHES.map((s) => [s.id, s]));

export function swatch(id: string): MascotSwatch | undefined {
  return SWATCH_BY_ID.get(id);
}

/** The hex for a swatch id, falling back to the first swatch. */
export function swatchHex(id: string): string {
  return SWATCH_BY_ID.get(id)?.hex ?? MASCOT_SWATCHES[0].hex;
}

// --- Mixing --------------------------------------------------------------

/**
 * Where a shaded colour is mixed *towards*, and where a tinted one is.
 *
 * Not black and white. Mixing a hue towards pure black kills its chroma faster
 * than its lightness and the underside comes out grey; mixing towards a deep
 * violet keeps the shadow coloured, which is what every hand-authored
 * colourway in this file was already doing by eye (Harmony's `#0E7C58`,
 * Wit's `#5326B5`). Tinting towards the shared paper rather than white keeps
 * the highlight the same warm off-white as the eye it sits beside.
 */
const SHADE_TOWARDS = "#1A1030";

function channels(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  const full =
    v.length === 3 ? v.split("").map((c) => c + c).join("") : v.padEnd(6, "0").slice(0, 6);
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/** Linear mix of two hexes, `t` of the way from `a` to `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const k = Math.min(1, Math.max(0, t));
  const to = (x: number, y: number): string =>
    Math.round(x + (y - x) * k)
      .toString(16)
      .padStart(2, "0");
  return `#${to(ar, br)}${to(ag, bg)}${to(ab, bb)}`;
}

/** Darker, and still the same hue. */
export function shadeHex(hex: string, amount: number): string {
  return mixHex(hex, SHADE_TOWARDS, amount);
}

/** Paler, towards the shared paper rather than towards white. */
export function tintHex(hex: string, amount: number): string {
  return mixHex(hex, MASCOT_INK.paper, amount);
}

/**
 * A whole colourway mixed off one swatch.
 *
 * Every slot is derived, so a concept adding a colourway names a swatch and a
 * garment pair and is done — and two concepts painted from the same swatch
 * agree about what its underside looks like, which is the thing five
 * hand-mixed purples could never do.
 *
 * The proportions are the ones the hand-authored Ytymo colourways landed on
 * after two rounds, read back out of their hexes: the underside about a third
 * of the way to the shadow, the limb a little less, the panel well towards
 * paper, and the spark almost all the way there.
 */
export function colorwayFromSwatch(
  hex: string,
  garment: { clothing: string; clothingAccent: string },
  overrides?: Partial<Colorway>,
): Colorway {
  return {
    bodyTop: hex,
    bodyBottom: shadeHex(hex, 0.34),
    limb: shadeHex(hex, 0.16),
    panel: tintHex(hex, 0.62),
    accent: tintHex(hex, 0.86),
    spark: shadeHex(hex, 0.52),
    sclera: MASCOT_INK.paper,
    pupil: MASCOT_INK.line,
    blush: tintHex("#FF7C9A", 0.1),
    clothing: garment.clothing,
    clothingAccent: garment.clothingAccent,
    ...overrides,
  };
}

// --- Silmu: the one-eyed bean --------------------------------------------

/**
 * The legacy mascot's own colours, and the one honest problem with them.
 *
 * The old School of Gaming minion was `#141414` — pure black to within two
 * points — and this site's background is `#121212`. On the page it would be
 * publishing a hole. Nothing about the character is broken; the ground it
 * used to stand on was white and now is not.
 *
 * Three ways out were drawn and looked at on the real background (see the
 * species' own file for what the rasters showed): a body lightened to a
 * charcoal, a near-black body with a light contour, and leaning on the eye,
 * the feet and the hat to carry it with no help from the body at all. The
 * third loses the silhouette, which is the thing the whole design rests on.
 * `musta` takes both of the first two, because they solve different halves —
 * the charcoal makes the mass visible and the contour makes the *edge*
 * visible, and a shape with mass but no edge on a dark ground reads as a
 * smudge rather than as a body.
 *
 * The `ink` slot is what tells the rest of the module this body is dark.
 * A brow and a mouth are the only parts of the face drawn *on* the
 * silhouette rather than cut out of it, so they invert to the paper colour
 * here, exactly as the legacy art drew its grin as a white shape rather than
 * as a black line.
 *
 * The colour variants are the other half of the legacy idea. That mascot was
 * one body and nine hats, and its files were named for the *hat* colour —
 * Blue, Green, Orange, Pink, Red. So the colourways here take the hats'
 * hues onto the body and let the garment slot carry the contrast, which is
 * the same trick turned inside out, and every one of them is a swatch the
 * product already owns rather than a hex invented for a mascot.
 */
const SILMU_GARMENT_LIGHT = { clothing: swatchHex("sky"), clothingAccent: MASCOT_INK.paper };

export const SILMU_VARIANTS: readonly VariantDef[] = [
  {
    id: "musta",
    label: "Musta",
    note: "The faithful one — charcoal and a contour, because pure black is a hole",
    colors: {
      bodyTop: "#22222A",
      bodyBottom: "#191920",
      // A step *lighter* than the body, which the original never had to be:
      // black arms on white paper read against the paper, and black arms on a
      // black page read against nothing. A raised waving arm crossing its own
      // body is invisible at the legacy value, so the limbs are lifted just
      // far enough to separate from both the body and the ground.
      limb: "#34343F",
      panel: "#2A2A33",
      accent: swatchHex("sky"),
      // Doubles as the contour: see the species' Body.
      spark: "#5C566B",
      sclera: MASCOT_INK.paper,
      pupil: MASCOT_INK.line,
      ink: MASCOT_INK.paper,
      blush: "#FF9BB0",
      ...SILMU_GARMENT_LIGHT,
    },
  },
  {
    id: "luumu",
    label: "Luumu",
    note: "Zone purple — the old SOG brand colour, at a lightness that survives #121212",
    colors: colorwayFromSwatch(swatchHex("purple"), {
      clothing: swatchHex("amber"),
      clothingAccent: MASCOT_INK.paper,
    }),
  },
  {
    id: "hehku",
    label: "Hehku",
    note: "Zone amber — the other old brand colour, and the closest swatch to the legacy orange",
    colors: colorwayFromSwatch(swatchHex("amber"), {
      clothing: swatchHex("purple"),
      clothingAccent: MASCOT_INK.paper,
    }),
  },
  {
    id: "oras",
    label: "Oras",
    note: "Zone green — the sprout one, after the legacy green tuft",
    colors: colorwayFromSwatch(swatchHex("green"), {
      clothing: swatchHex("amber"),
      clothingAccent: MASCOT_INK.paper,
    }),
  },
  {
    id: "taivas",
    label: "Taivas",
    note: "Zone sky — the signature cap's own blue, worn as a body",
    colors: colorwayFromSwatch(swatchHex("sky"), {
      clothing: swatchHex("amber"),
      clothingAccent: MASCOT_INK.paper,
    }),
  },
];

// --- Palikka: the voxel animals ------------------------------------------

/**
 * A cube needs three tones, and this is where the third one comes from.
 *
 * Every other species in this directory is drawn with one lit surface and one
 * shaded one, which the `bodyTop` / `bodyBottom` pair covers exactly. A block
 * has a *front*, a *top* and a *right*, and the whole reason a stack of blocks
 * reads as solid rather than as a flat mosaic is that those three faces are
 * three different values of the same hue. So Palikka spends one more slot:
 *
 * - `bodyTop` — the **front** face, the one the eyes and mouth land on.
 * - `bodyBottom` — the **right** face, the shaded one.
 * - `spark` — the **top** face, the lit one.
 *
 * `spark` is the honest choice for it (its own doc calls it "a third colour,
 * used sparingly, for facets") but it is the one slot `colorwayFromSwatch`
 * derives *darker* than the body, so **every Palikka colourway has to override
 * it**, and a swatch-derived one that forgets will come out with its lit face
 * darker than its shaded one. There is no way for the concept to detect that
 * and no reason for it to try: the list is right here, it is five entries
 * long, and each of them says `spark` out loud.
 *
 * The two faithful colourways are read straight off the legacy artwork —
 * `hipponen.png` and `treksi.png` — one hex per cube face, which is what those
 * two files literally are. Sampling them was worth doing: the hippo's three
 * purples turn out to be almost exactly a 20% tint and a 30% shade of its
 * front face, which is the ratio the derived colourways now use, so the
 * legacy art and a swatch-derived one shade themselves the same way.
 */
const PALIKKA_SWATCH_GARMENT = { clothing: swatchHex("purple"), clothingAccent: MASCOT_INK.paper };

export const PALIKKA_VARIANTS: readonly VariantDef[] = [
  {
    id: "oliivi",
    label: "Oliivi",
    note: "Treksi's own olive, sampled face by face off the legacy file",
    colors: {
      bodyTop: "#a99c34",
      bodyBottom: "#7c7325",
      limb: "#8f852c",
      // The cream belly, which is the legacy T-rex's second-strongest landmark
      // after the head.
      panel: "#f9efdb",
      // The dark red the legacy file spends on the mouth block. Here it is the
      // brow ridge instead — the mouth is the face grammar's glyph and takes
      // the shared ink like every other species' does.
      accent: "#99261a",
      spark: "#c6b842",
      sclera: MASCOT_INK.paper,
      pupil: MASCOT_INK.line,
      blush: "#FF9BB0",
      clothing: swatchHex("purple"),
      clothingAccent: MASCOT_INK.paper,
    },
  },
  {
    id: "violetti",
    label: "Violetti",
    note: "Hipponen's purple, likewise sampled — front, top and side as delivered",
    colors: {
      bodyTop: "#ab4a9c",
      bodyBottom: "#86328c",
      limb: "#702c8d",
      panel: "#c07fbc",
      accent: "#5f2379",
      spark: "#a967aa",
      sclera: MASCOT_INK.paper,
      pupil: MASCOT_INK.line,
      blush: "#FF9BB0",
      clothing: swatchHex("amber"),
      clothingAccent: MASCOT_INK.paper,
    },
  },
  {
    id: "ruska",
    label: "Ruska",
    note: "Zone amber — the autumn one, for the antlered build",
    colors: colorwayFromSwatch(swatchHex("amber"), PALIKKA_SWATCH_GARMENT, {
      spark: tintHex(swatchHex("amber"), 0.24),
    }),
  },
  {
    id: "sammal",
    label: "Sammal",
    note: "Zone lime — moss, and the closest swatch to the legacy olive",
    colors: colorwayFromSwatch(swatchHex("lime"), PALIKKA_SWATCH_GARMENT, {
      spark: tintHex(swatchHex("lime"), 0.24),
    }),
  },
  {
    id: "routa",
    label: "Routa",
    note: "Zone sky — ground frost, the cold end of the range",
    colors: colorwayFromSwatch(swatchHex("sky"), {
      clothing: swatchHex("amber"),
      clothingAccent: MASCOT_INK.paper,
    }, {
      spark: tintHex(swatchHex("sky"), 0.24),
    }),
  },
];

// --- Colour presets ------------------------------------------------------

/**
 * Partial colourways that a caller can layer over a concept's own. They are
 * partial on purpose: a season should repaint the *clothes*, never the
 * character. Overriding `clothing` and `clothingAccent` swaps a wardrobe;
 * overriding `bodyTop` would swap the animal, which is the one thing
 * customisation is not allowed to do.
 */
export type ColorOverride = Partial<Colorway>;

/**
 * A preset only ever names `clothing` and `clothingAccent`. That is not a
 * convention, it is the guarantee: those two slots are the only ones no
 * concept's *body* is painted from, so a season can repaint every garment in
 * the fleet and cannot repaint a single character. An earlier draft of these
 * presets also set `accent`, which quietly recoloured one concept's hoodie and
 * proved the point.
 */
export type PalettePreset = { id: string; label: string; colors: ColorOverride };

export const PALETTE_PRESETS: readonly PalettePreset[] = [
  { id: "native", label: "Native", colors: {} },
  {
    id: "winter",
    label: "Winter",
    colors: { clothing: "#B23A48", clothingAccent: "#FFFFFF" },
  },
  {
    id: "summer",
    label: "Summer",
    colors: { clothing: "#2AB6A6", clothingAccent: "#FFF7DC" },
  },
  {
    id: "halloween",
    label: "Halloween",
    colors: { clothing: "#2A1B3D", clothingAccent: "#FF8A2B" },
  },
  {
    id: "brand",
    label: "Brand",
    colors: { clothing: BRAND.secondary, clothingAccent: BRAND.primary },
  },
];

/** The four elements in their canonical order, for anything that lists them. */
export const YTY_ORDER = ["harmony", "glow", "valor", "wit"] as const;
export type YtyPip = (typeof YTY_ORDER)[number];

/**
 * The element colours as flat pips — a small lit dot or diamond a character
 * can wear as part of its own body rather than as a garment.
 *
 * This is the one exception to "an outfit repaints, a body does not", and it
 * earns it: the four elements are the piece of iconography the product owns
 * outright, so a concept that wants to be unmistakably *ours* rather than
 * generically nice has these to reach for. They are the lore's colours, not
 * the caller's, which is why they are a constant here and not a colourway slot.
 */
export const YTY_PIPS: Record<YtyPip, string> = YTY_ELEMENT;

/**
 * The four elements as wardrobe tints, so any concept can be dressed in an
 * element without becoming a Ytymo. This is the cheap way to get element
 * flavour onto a fleet whose lore is otherwise fresh.
 */
export const YTY_WARDROBE: Record<keyof typeof YTY_ELEMENT, ColorOverride> = {
  harmony: { clothing: YTY_ELEMENT.harmony, clothingAccent: "#DFFBEE" },
  glow: { clothing: YTY_ELEMENT.glow, clothingAccent: "#FFF7DC" },
  valor: { clothing: YTY_ELEMENT.valor, clothingAccent: "#FFEAEE" },
  wit: { clothing: YTY_ELEMENT.wit, clothingAccent: "#F1EAFF" },
};

// --- scenery: the materials a scene is built out of ----------------------

/**
 * Wood, stone and leather.
 *
 * `MASCOT_INK` covers the two neutrals every *device* is moulded out of, and
 * that was enough while the only furniture in the system was a desk and a
 * gaming chair — both of which are plastic. A door is not. Nor is a
 * briefcase, and a paint bucket is neither: they are the materials a world is
 * made of rather than the materials a gadget is made of, and painting them
 * out of the device neutrals would give the school a plastic door.
 *
 * They are their own export rather than more keys on `MASCOT_INK` for the
 * same reason the device neutrals are not a colourway: nothing here is ever
 * repainted. A character's colours change per member and per season; the wood
 * a door is made of does not, and a scene that re-tinted its own timber to
 * match whoever was standing at it would stop reading as a place.
 *
 * Every value is warm rather than grey — the same reason `SHADE_TOWARDS` is a
 * deep violet and not black. A neutral brown on a near-black page reads as
 * dirt; these keep enough chroma to look like material under a light.
 */
export const MASCOT_SCENERY = {
  /** The lit face of a plank. */
  wood: "#9C6B3A",
  /** The shaded face, and the gap between two planks. */
  woodDark: "#754E28",
  /** The grain and the plank seams — a line, not a fill. */
  woodLine: "#4E321A",
  /** A doorstep, a kerb, the metal of a paint can. */
  stone: "#6E6A78",
  stoneDark: "#4C4956",
  /** A briefcase, a satchel, a strap. */
  leather: "#A9713C",
  leatherDark: "#7A4E27",
} as const;

// --- Otso, second cohort: the legacy cast's animals -----------------------

/**
 * Seven more Otso coats, for the forms rebuilt out of the old SOG cast.
 *
 * They live down here rather than beside `OTSO_VARIANTS` for a dull reason
 * that is worth writing down once: the swatch list and the mixers are defined
 * *below* that array, so a colourway up there that called `swatchHex()` would
 * read a `const` inside its own temporal dead zone and throw at module load.
 * Anything derived from a swatch has to be declared after the swatch table.
 * The concept spreads the two arrays together, `OTSO_VARIANTS` first, so the
 * cub's honey coat is still the family's default.
 *
 * Every one of these is mixed off `MASCOT_SWATCHES` rather than picked by eye,
 * which is the standing ruling: a mascot may not introduce a hue the product
 * does not already own. Two of them need a colour the swatch list has no name
 * for — a grey and a soot — and both get there by *mixing* swatches rather
 * than by inventing a hex, which is written out at each one.
 */

/**
 * A neutral grey with no swatch of its own.
 *
 * Indigo and lime sit far enough apart on the wheel that a half-and-half mix
 * cancels most of the chroma, and tinting the result towards paper lifts it
 * clear of the page's own near-black. The point of doing it this way rather
 * than typing `#A9B3A7` is that the grey moves if the zone hues are ever
 * retuned, instead of quietly drifting away from them.
 */
const RAT_GREY = tintHex(mixHex(swatchHex("indigo"), swatchHex("lime"), 0.5), 0.25);

export const OTSO_CAST_VARIANTS: readonly VariantDef[] = [
  {
    id: "rosvo",
    label: "Rosvo",
    note: "R Osmo's own two colours — an orange coat under a purple bandit mask",
    colors: colorwayFromSwatch(
      swatchHex("orange"),
      { clothing: swatchHex("purple"), clothingAccent: MASCOT_INK.paper },
      // `spark` is the slot the animal family paints its dark markings from —
      // a raccoon's mask, a tit's cap, a leopard's rosettes. Here it is the
      // legacy character's purple rather than a shade of his own orange,
      // because the mask being a *different* colour from the coat is the whole
      // joke: rosvo means bandit.
      { spark: shadeHex(swatchHex("purple"), 0.22) },
    ),
  },
  {
    id: "taika",
    label: "Taika",
    note: "Hulmu's white-and-violet — a pale coat with the mane and tail left saturated",
    colors: colorwayFromSwatch(
      tintHex(swatchHex("violet"), 0.72),
      { clothing: swatchHex("amber"), clothingAccent: MASCOT_INK.paper },
      {
        // The one colourway where `bodyBottom` is *louder* than `bodyTop`
        // rather than darker. On every other form that slot is the underside;
        // on the unicorn it is the mane and the tail, which are the two parts
        // anyone actually looks at.
        bodyBottom: swatchHex("violet"),
        limb: tintHex(swatchHex("violet"), 0.5),
        accent: swatchHex("amber"),
        spark: shadeHex(swatchHex("violet"), 0.3),
      },
    ),
  },
  {
    id: "ruusu",
    label: "Ruusu",
    note: "Taply's pink, with the rosettes in a deeper fuchsia",
    colors: colorwayFromSwatch(
      swatchHex("pink"),
      { clothing: swatchHex("lime"), clothingAccent: MASCOT_INK.paper },
      { spark: shadeHex(swatchHex("fuchsia"), 0.18) },
    ),
  },
  {
    id: "noki",
    label: "Noki",
    note: "Nörtti's soot — dark enough to be the fuzzy one, light enough not to be a hole",
    colors: {
      // The same problem the one-eyed species had and the same answer: the
      // legacy drawing is pure black on white paper, and pure black on a
      // #121212 page is not a character, it is a gap. Lifted to a charcoal
      // with a violet cast so the mass is visible, and `spark` sits a step
      // lighter again to serve as the contour that makes the *edge* visible.
      bodyTop: "#38304A",
      bodyBottom: "#2A2338",
      limb: "#4B4066",
      panel: "#443A5C",
      // The wings and the antenna knobs. Pink, as delivered.
      accent: swatchHex("pink"),
      spark: "#6E6288",
      sclera: MASCOT_INK.paper,
      pupil: MASCOT_INK.line,
      // A brow and a mouth are drawn *on* this silhouette rather than cut out
      // of it, so they invert to paper. Same reason as the black bean's.
      ink: MASCOT_INK.paper,
      blush: "#FF9BB0",
      clothing: swatchHex("amber"),
      clothingAccent: MASCOT_INK.paper,
    },
  },
  {
    id: "tiainen",
    label: "Tiainen",
    note: "Great tit — yellow front, olive back, near-black cap, and a blue hat to wear",
    colors: colorwayFromSwatch(
      swatchHex("yellow"),
      { clothing: swatchHex("blue"), clothingAccent: swatchHex("red") },
      {
        // A great tit is three colours and the bird is unreadable without all
        // three: the olive back, the cream cheek (which is `panel`, already
        // derived) and the cap, which has to be near-black rather than a
        // shade of yellow or the bird turns into a duckling.
        bodyBottom: shadeHex(swatchHex("lime"), 0.28),
        spark: "#2A2438",
      },
    ),
  },
  {
    id: "rotta",
    label: "Rotta",
    note: "MoodyRat's coat — a mixed grey with the ears, muzzle, paws and tail left pink",
    colors: colorwayFromSwatch(
      RAT_GREY,
      // Straw and a green band: the Gardener's hat is the one garment this
      // coat has to look right in, and a straw hat dyed lime is a lime hat.
      { clothing: swatchHex("amber"), clothingAccent: swatchHex("lime") },
      {
        // `panel` is the pale-inset slot every form already paints its muzzle
        // and belly from, which on a rat happens to be exactly the set of
        // parts that are bare skin. So the faithful grey-and-pink read costs
        // one override rather than a new slot.
        panel: tintHex(swatchHex("pink"), 0.42),
        accent: tintHex(swatchHex("pink"), 0.16),
        spark: shadeHex(RAT_GREY, 0.45),
      },
    ),
  },
  {
    id: "majava",
    label: "Majava",
    note: "Beaver brown — orange taken down to a warm timber, tail a shade darker",
    colors: colorwayFromSwatch(shadeHex(swatchHex("orange"), 0.46), {
      clothing: swatchHex("teal"),
      clothingAccent: MASCOT_INK.paper,
    }),
  },
];

/**
 * The colour a **dark marking** is painted in — a raccoon's bandit mask, a
 * great tit's cap, a leopard's rosettes, the bands on a ringed tail.
 *
 * `spark` looks like the slot for this and is only half of one. It was
 * defined as "a third colour, used sparingly, for facets and highlights" back
 * when no species had markings, so the hand-authored colourways put a
 * near-white there — and a raccoon painted from one of those came out with a
 * pale bandit mask, which is not a bandit mask. The colourways mixed later by
 * `colorwayFromSwatch` derive `spark` as a *shade*, so the same slot means
 * opposite things depending on which era a coat comes from.
 *
 * Rather than redefine the slot under the coats that already use it, this
 * reads it and checks: a marking is *by definition* darker than the coat, so
 * a `spark` that is darker wins — which is how a colourway asks for a marking
 * in a deliberately different hue, the way the raccoon's own coat asks for
 * purple — and a `spark` that is lighter is a highlight, not a marking, so
 * the underside is taken down a step instead. Every coat then works on every
 * form, which is the property the family rests on.
 */
export function markingHex(colors: Colorway): string {
  return relLuma(colors.spark) < relLuma(colors.bodyTop) - 0.05
    ? colors.spark
    : shadeHex(colors.bodyBottom, 0.34);
}

/**
 * Rough perceptual luminance, 0–1. Not sRGB-correct and does not need to be:
 * the only question asked of it is "is this one darker than that one", and
 * the two colours being compared are always far apart when the answer
 * matters.
 */
function relLuma(hex: string): number {
  const [r, g, b] = channels(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// --- Porukka: the flat-yellow people -------------------------------------

/**
 * One skin for the whole cast, and where the number comes from.
 *
 * The reference (`huhtala.png`) uses `#ffc61c` and its sibling picture
 * `#fdc445` — a saturated golden yellow that is not any human complexion and
 * is not trying to be. That unreality is the safeguard, not a stylisation: a
 * cast that all shares one impossible skin carries its difference in hair and
 * clothes and never in ethnicity, which is the same guarantee Kaveri's lilac
 * and teal give from the other direction.
 *
 * It is *derived* rather than transcribed. Mixing the amber and yellow zone
 * hues and lifting the result a tenth of the way towards the shared paper
 * lands on a warm gold within a couple of points of the reference, and does it
 * out of colours the product already owns — so a retune of the zone palette
 * reaches the mascot's skin instead of leaving one orphan hex behind.
 */
export const PORUKKA_SKIN = tintHex(mixHex(swatchHex("amber"), swatchHex("yellow"), 0.45), 0.1);

/**
 * The one darker tone the reference puts under a hairline, kept in
 * `bodyBottom` and drawn by nothing.
 *
 * The simplicity ruling takes shading off a base form, so this is not on the
 * character. The slot survives because it is where a *second complexion*
 * would go if the fleet ever ships more than one — that is a real decision
 * somebody may want to take, and it should not require a new colourway shape
 * to take it.
 */
const PORUKKA_SKIN_DEEP = shadeHex(PORUKKA_SKIN, 0.14);

/**
 * The nose dot's pink, from the pink zone hue tinted well back.
 *
 * The reference's is `#f3a4ca`. A flat dot of it is a *symbol* for a nose in
 * the same sense the mouth glyph is a symbol for a mouth — it is not a
 * highlight and claims nothing about a light source, which is what the face
 * grammar's ban on nose glints is actually about.
 */
const PORUKKA_NOSE = tintHex(swatchHex("pink"), 0.42);

/**
 * A Porukka colourway: constant skin, a hair colour, and two garments.
 *
 * Hair goes in `limb` (the concept's arms are sleeves and its legs trousers,
 * so the slot was free) and is always a *deep* mix of a swatch rather than the
 * swatch itself — an unshaded zone hue on top of a head reads as a hat, and
 * hair has to read as hair even when its colour is invented. `panel` is the
 * shoe, taken a long way down from the trouser so a sole separates from a leg
 * on a dark page.
 */
function porukkaColorway(hair: string, top: string, bottom: string): Colorway {
  return {
    bodyTop: PORUKKA_SKIN,
    bodyBottom: PORUKKA_SKIN_DEEP,
    limb: hair,
    panel: shadeHex(bottom, 0.2),
    accent: tintHex(top, 0.7),
    spark: PORUKKA_NOSE,
    sclera: MASCOT_INK.paper,
    pupil: MASCOT_INK.line,
    blush: PORUKKA_NOSE,
    clothing: top,
    clothingAccent: bottom,
  };
}

/**
 * Five colourways, named for the hair, because on a cast with one skin the
 * hair is the first thing anybody uses to tell two people apart.
 *
 * The garment pairs are deliberately not tonal: a top from one swatch and a
 * bottom from a different one is what the reference does (mint over dark
 * green, striped blue over royal blue) and it is what keeps a figure from
 * reading as a single-colour cut-out at small sizes.
 */
export const PORUKKA_VARIANTS: readonly VariantDef[] = [
  {
    id: "noki",
    label: "Noki",
    note: "Soot — indigo taken almost all the way down, which is the black that still has a hue in it",
    colors: porukkaColorway(
      shadeHex(swatchHex("indigo"), 0.7),
      swatchHex("emerald"),
      shadeHex(swatchHex("emerald"), 0.3),
    ),
  },
  {
    id: "ruis",
    label: "Ruis",
    // Blond has to be *lighter* than the skin, not a shade of it. The
    // reference is unambiguous: its blond is `#ffe978` against `#ffc61c`
    // skin, and a first pass that shaded the amber swatch towards brown
    // produced a head where the hairline vanished at every size.
    note: "Rye — a pale straw blond, which is the one hair colour that has to sit lighter than the skin",
    colors: porukkaColorway(
      tintHex(swatchHex("yellow"), 0.5),
      swatchHex("sky"),
      shadeHex(swatchHex("blue"), 0.26),
    ),
  },
  {
    id: "kupari",
    label: "Kupari",
    note: "Copper — the orange hue shaded to auburn, over violet",
    colors: porukkaColorway(
      shadeHex(swatchHex("orange"), 0.46),
      swatchHex("violet"),
      shadeHex(swatchHex("violet"), 0.34),
    ),
  },
  {
    id: "usva",
    label: "Usva",
    note: "Mist — the elder's silver, which is paper mixed a fifth towards the soft line so it holds an edge on a yellow head",
    colors: porukkaColorway(
      mixHex(MASCOT_INK.paper, MASCOT_INK.lineSoft, 0.2),
      swatchHex("teal"),
      shadeHex(swatchHex("teal"), 0.34),
    ),
  },
  {
    id: "puola",
    label: "Puola",
    note: "Lingonberry — the red hue shaded to a dark berry, over camp lime",
    colors: porukkaColorway(
      shadeHex(swatchHex("red"), 0.62),
      swatchHex("camp"),
      shadeHex(swatchHex("camp"), 0.32),
    ),
  },
];

// --- Stadi: the inked humanoid --------------------------------------------

/**
 * The one line colour the Helsinki-ink species is drawn with, and the honest
 * reason it is not black.
 *
 * The idiom this concept is derived from puts a thick near-black contour
 * around every shape, and it works because every one of those pictures sits on
 * a *light* ground: white paper, a yellow field, a green field. The line there
 * is the darkest thing in the frame and it separates the figure from the page.
 *
 * This site's page is `#121212`, so the line would be the *same* thing as the
 * page. Measured against it: pure black is 1.12:1 and the shared
 * `MASCOT_INK.line` is 1.14:1 — an outer contour drawn in either is not a
 * faint line, it is no line at all, and the silhouette simply shrinks by one
 * stroke width. Going the other way is no better: an ink lifted far enough to
 * be comfortable on the page (`#5C566B`, 2.67:1) drops to 1.66:1 against a
 * brick-red complexion and stops reading as black *inside* the drawing, which
 * is where nearly all of this idiom's line actually lives.
 *
 * `#3A3350` is where those two failures cross. It is 1.58:1 on the page —
 * enough that the outer contour is a visible edge rather than nothing — and
 * 11.2:1 on paper, 7.7:1 on the pale sky complexion and 2.8:1 on the brick
 * one, so against every fill in the species it is still unmistakably the black
 * line. It is a violet-leaning near-black rather than a neutral one for the
 * same reason `SHADE_TOWARDS` is: a grey line beside these fills reads as
 * washed out, and the shared ink is already a plum.
 *
 * The rasters behind those numbers, and what they showed at 200px and 40px,
 * are written up at the top of `concepts/stadi.tsx`.
 */
export const STADI_INK = {
  /** Every contour, every interior stroke, the hair, and the inked garments. */
  line: "#3A3350",
} as const;

/**
 * Four unreal complexions, and the palette discipline that goes with them.
 *
 * The rule taken from the sources is exact and was measured rather than
 * guessed: sampling a whole panel of the reference material returns a *ground*
 * colour, one or two figure colours, black and white, and nothing else — one
 * collage half comes back as literally mint, black and white. So every
 * colourway here is **two swatch colours plus the line and the paper**: one
 * spent on the complexion, one on the garment. There is no third hue and no
 * shading anywhere, which is why `bodyBottom` is the same value as `bodyTop`
 * — this species has no second plane, and a slot it does not use is set to
 * the value that makes that visible rather than to a shade nobody will draw.
 *
 * The complexions are deliberately impossible for the same reason Kaveri's
 * are, and the sources agree: the reference trio is pale blue, the collage's
 * people are peach, brick and white. A skin colour that could be read as a
 * real one invites the question of which child this is meant to be.
 */
function stadiColorway(
  skin: string,
  garment: string,
  hair: string,
  garmentTrim: string,
): Colorway {
  return {
    bodyTop: skin,
    // No second plane. See the note above.
    bodyBottom: skin,
    // The trousers: the garment mixed a third of the way to paper, which is
    // the only place this species spends a second *value* of anything. It is
    // not a third colour — it is the one the sources use when a figure's top
    // and bottom are the same garment hue at two weights — and it exists
    // because the shared limb renderer draws no line of its own, so a leg and
    // the torso above it can only be told apart by value.
    limb: tintHex(garment, 0.3),
    // The collar block cut into the garment.
    panel: garmentTrim,
    // The garment itself — the one big colour block under the head, and the
    // sleeves, which are the same cloth.
    accent: garment,
    // The hair mass: the line colour by default, one swatch where a colourway
    // wants to spend its second colour there instead.
    spark: hair,
    sclera: MASCOT_INK.paper,
    pupil: STADI_INK.line,
    // The mouth and brows are drawn *on* the complexion, which is light in
    // every colourway here, so they take the same line as everything else.
    ink: STADI_INK.line,
    blush: MASCOT_INK.paper,
    clothing: garment,
    clothingAccent: garmentTrim,
  };
}

export const STADI_VARIANTS: readonly VariantDef[] = [
  {
    id: "taivas",
    label: "Taivas",
    note: "Pale sky skin over amber — the reference trio's complexion, and the cyclist's warm garment",
    colors: stadiColorway(
      tintHex(swatchHex("sky"), 0.55),
      swatchHex("amber"),
      STADI_INK.line,
      MASCOT_INK.paper,
    ),
  },
  {
    id: "tiili",
    label: "Tiili",
    note: "Brick skin over sky — the collage's terracotta people, with the blue moved onto the clothes",
    colors: stadiColorway(
      shadeHex(swatchHex("orange"), 0.3),
      swatchHex("sky"),
      STADI_INK.line,
      MASCOT_INK.paper,
    ),
  },
  {
    id: "okra",
    label: "Okra",
    note: "Pale yellow skin over green — the yellow field and the green field, worn instead of printed",
    colors: stadiColorway(
      tintHex(swatchHex("yellow"), 0.52),
      swatchHex("green"),
      STADI_INK.line,
      MASCOT_INK.paper,
    ),
  },
  {
    id: "paperi",
    label: "Paperi",
    note: "Paper skin, paper cloth, and nothing else — the whole figure is the line, which is the register the reference sheet's self-portrait is drawn in",
    colors: stadiColorway(
      MASCOT_INK.paper,
      MASCOT_INK.paper,
      STADI_INK.line,
      swatchHex("emerald"),
    ),
  },
  {
    id: "ratikka",
    label: "Ratikka",
    note: "Pale sky skin, tram green, and the one colourway that spends its second colour on the hair instead of leaving it black",
    colors: stadiColorway(
      tintHex(swatchHex("sky"), 0.55),
      swatchHex("green"),
      swatchHex("green"),
      MASCOT_INK.paper,
    ),
  },
];

// --- Metsänväki: the pen line on a night ground --------------------------

/**
 * The one pen this species is drawn with, and why it is a single value.
 *
 * The reference sheets (`jansson/j2.jpg`, `jansson/j3.jpg` in the working
 * folder — the same two figures drawn seventeen years apart) were measured
 * rather than eyeballed: the ink line is a constant three pixels on a figure
 * two hundred and ninety pixels tall, it is the *same* three pixels on the
 * four-hundred-and-thirty-pixel figure beside it, and it is the same again on
 * the interior marks. Line weight there is a property of the pen, not of the
 * drawing — a small creature does not get a thinner line — so this is one
 * constant and every form uses it at one width.
 *
 * It is a blue-black rather than the shared plum `MASCOT_INK.line`, because
 * this species is nocturnal by construction and its line has to sit on a page
 * that is already dark. Deriving it from the indigo swatch keeps it inside the
 * product's own palette rather than inventing a mascot black.
 *
 * Distinct on purpose from `STADI_INK`, which is the *other* ink species here:
 * that one is a thick brush contour around flat colour, this one is a thin
 * even nib around a wash. Two Finnish idioms, and the difference between them
 * is entirely in the line.
 */
export const METSA_INK = {
  /** The nib. Every contour, every limb, every face mark in a wash colourway. */
  pen: shadeHex(swatchHex("indigo"), 0.78),
  /** The paper a wash is tinted towards, and the line an inverted one is drawn in. */
  paper: MASCOT_INK.paper,
} as const;

/**
 * How dark a wash gets to be. A pale figure on a dark page is the only thing
 * carrying the silhouette below about sixty pixels, where the line has stopped
 * existing, so the wash cannot be a whisper: two thirds of the way to paper is
 * the point where the raster still reads as one shape at forty pixels and the
 * pen line still reads as a line at two hundred.
 */
const METSA_WASH = 0.66;

/**
 * One colourway, in one of the two registers the raster comparison left
 * standing. See the top of `concepts/metsa.tsx` for what each one showed.
 *
 * - `wash` is ink on paper with the paper tinted: a pale figure, drawn round
 *   with the dark nib. This is the shipped register.
 * - `night` is the same drawing inverted — a body barely above the page and a
 *   pale line round it. Kept as one colourway rather than as a whole set,
 *   because it is genuinely the more atmospheric of the two at large sizes and
 *   genuinely illegible at small ones, and a species that ships both registers
 *   is two species.
 *
 * Either way there is exactly **one** hue and no second plane: `bodyBottom`
 * repeats `bodyTop` rather than holding a shade nothing draws, which is the
 * same admission the flat-colour species makes for the same reason.
 */
function metsaColorway(hex: string, register: "wash" | "night"): Colorway {
  const fill = register === "wash" ? tintHex(hex, METSA_WASH) : shadeHex(hex, 0.76);
  const line = register === "wash" ? METSA_INK.pen : tintHex(hex, 0.84);
  return {
    bodyTop: fill,
    // No second plane — one wash, as the register says.
    bodyBottom: fill,
    // A limb here is a pen stroke, not a painted arm, so it takes the line.
    limb: line,
    // The one interior block a form is allowed: a muzzle against a face, a
    // face against a spined back. A value rather than a line, so it survives
    // the sizes the line does not.
    panel: register === "wash" ? tintHex(hex, 0.88) : shadeHex(hex, 0.6),
    // The single loud note — a leaf, a berry, a lantern flame — at full
    // strength, because there is only ever a few square units of it.
    accent: hex,
    spark: register === "wash" ? shadeHex(hex, 0.3) : tintHex(hex, 0.6),
    // The eye is a pale disc with a dark centre in a wash colourway and a pale
    // ring round a dark centre in a night one — which is the same two circles,
    // and in both cases is what the reference draws.
    sclera: register === "wash" ? MASCOT_INK.paper : line,
    pupil: register === "wash" ? METSA_INK.pen : fill,
    // The mouth is one short unclosed stroke drawn *on* the body, so it is the
    // pen, whichever way round the pen is.
    ink: line,
    blush: MASCOT_INK.paper,
    clothing: hex,
    clothingAccent: tintHex(hex, 0.7),
  };
}

/**
 * Six washes and one night, named for what they are washes *of*. Every hue is
 * a swatch the product already owns; the Finnish names are the point of the
 * species, not decoration on it.
 */
export const METSA_VARIANTS: readonly VariantDef[] = [
  {
    id: "kuu",
    label: "Kuu",
    note: "Moon — the palest wash, and the one the whole species defaults to",
    colors: metsaColorway(swatchHex("sky"), "wash"),
  },
  {
    id: "sammal",
    label: "Sammal",
    note: "Moss — the forest floor, and the warmest of the greens",
    colors: metsaColorway(swatchHex("green"), "wash"),
  },
  {
    id: "puolukka",
    label: "Puolukka",
    note: "Lingonberry — the one red in a set that is otherwise all cold",
    colors: metsaColorway(swatchHex("red"), "wash"),
  },
  {
    id: "usva",
    label: "Usva",
    note: "Mist — the wash that reads as almost no colour at all",
    colors: metsaColorway(swatchHex("cyan"), "wash"),
  },
  {
    id: "tuohi",
    label: "Tuohi",
    note: "Birch bark — the only warm neutral, and the closest to real paper",
    colors: metsaColorway(swatchHex("amber"), "wash"),
  },
  {
    id: "havu",
    label: "Havu",
    note: "Spruce — the deepest wash that still holds its shape at forty pixels",
    colors: metsaColorway(swatchHex("emerald"), "wash"),
  },
  {
    id: "hamara",
    label: "Hämärä",
    note: "Dusk — the drawing inverted: a pale nib on a body barely above the page. Beautiful large, illegible small",
    colors: metsaColorway(swatchHex("indigo"), "night"),
  },
];

// --- Kylä: the village animals -------------------------------------------

/**
 * Six coats for the village, and the one rule that makes them a village.
 *
 * The Kunnas pages this concept studies (`kunnas/k3.jpg`, `k4.jpg`, `k5.jpg`)
 * are not painted in saturated colour. Sampling them gives four to six hues
 * per page — an ochre, a terracotta, a brick red, one olive, one dusty blue —
 * every one of them sitting well short of full chroma, on warm paper. Black
 * appears only as punctuation: a nose, a shoe, a spilled inkwell.
 *
 * So every value here is a swatch **muted towards the shared paper** before it
 * is used, rather than the swatch itself. `tintHex` mixes towards
 * `MASCOT_INK.paper` — a warm off-white rather than a neutral one — which is
 * exactly the "watercolour on warm stock" move, done with the product's own
 * colours instead of with invented ones. A coat comes out roughly a third of
 * the way to paper and a garment a fifth, which keeps the garment the louder
 * of the two: the fur is the ground and the clothes are the figure, which is
 * the way round a dressed animal has to read.
 *
 * The collar is not a slot here at all: it is `MASCOT_INK.paper` at the
 * drawing, the same warm off-white the `village` scene paints its window
 * frames and corner boards with. White trim on a coloured board is the most
 * Finnish thing in this palette — it is what every red farmhouse in the
 * country does — and holding it as a constant rather than as a per-member
 * colour is what makes a villager and the house behind them look like one
 * picture instead of two.
 */
function kylaColorway(
  coatSwatch: string,
  garmentSwatch: string,
  accentSwatch: string,
  options?: { coatMute?: number },
): Colorway {
  const coat = tintHex(swatchHex(coatSwatch), options?.coatMute ?? 0.34);
  const garment = tintHex(swatchHex(garmentSwatch), 0.2);
  return {
    bodyTop: coat,
    // Horns, a beard, the underside of a tail: one step down from the coat,
    // never a shading pass on it.
    bodyBottom: shadeHex(coat, 0.24),
    // Unused by this species — every limb is painted from a garment slot, so
    // this is set to the coat rather than to a colour nobody will ever see.
    limb: coat,
    // The snout block and the inside of an ear. Well towards paper, because
    // the black nose has to be the darkest thing on the face by a mile.
    panel: tintHex(coat, 0.52),
    // The one loud colour per character — a comb, a beak, a wattle.
    accent: tintHex(swatchHex(accentSwatch), 0.12),
    // The boots. A dark version of the garment rather than a leather brown, so
    // a villager's shoes belong to their clothes and not to the scenery.
    spark: shadeHex(garment, 0.52),
    sclera: MASCOT_INK.paper,
    pupil: MASCOT_INK.line,
    blush: MASCOT_INK.paper,
    clothing: garment,
    // The trousers: the coat's own colour taken down a step. One garment hue
    // per villager, in three values - coat, hose, boot - rather than three
    // hues, because a fleet told apart by *which* colour cannot also be told
    // apart by how many.
    clothingAccent: shadeHex(garment, 0.3),
  };
}

export const KYLA_VARIANTS: readonly VariantDef[] = [
  {
    id: "okra",
    label: "Okra",
    note: "Ochre fur under a blue coat — the village's default, and the closest thing here to a working day",
    colors: kylaColorway("amber", "blue", "red"),
  },
  {
    id: "savi",
    label: "Savi",
    note: "Clay — the terracotta the reference pages spend most of their floor on",
    colors: kylaColorway("orange", "green", "amber"),
  },
  {
    id: "kaura",
    label: "Kaura",
    note: "Oat — the palest coat, for the villager who has to read against a dark doorway",
    colors: kylaColorway("yellow", "red", "teal", { coatMute: 0.52 }),
  },
  {
    id: "sammal",
    label: "Sammal",
    note: "Moss — a coat no real animal has, which is the point: colour tells two of them apart, not detail",
    colors: kylaColorway("emerald", "amber", "red"),
  },
  {
    id: "karpalo",
    label: "Karpalo",
    note: "Cranberry — the pink end of the set, and the one the pig was always going to take",
    colors: kylaColorway("pink", "teal", "amber"),
  },
  {
    id: "tervas",
    label: "Tervas",
    note: "Tar pine — the one cool coat in a warm set, lifted further towards paper than the rest because a genuinely dark villager on a near-black page is a hole rather than a character",
    colors: kylaColorway("indigo", "amber", "orange", { coatMute: 0.42 }),
  },
];

// --- Jalo: the brand mark, and the brand's own corner rounding ------------

/**
 * The wordmark's corner radius, as a fraction of the segment it is cut into.
 *
 * Measured off `sog-logo-clean.svg` rather than chosen. The S of the SOG
 * lockup is built from bars 13.35 units tall (the top bar runs y 55.9 to 69.2;
 * the O's stroke is 13.4 thick, which is the same number twice), and every
 * corner on them is an arc of radius 5.1 — fitted from the path's own cubics:
 * the right end cap turns 90 degrees over a 7.1-unit chord, which is a circle
 * of r 5.13, and the four chamfer corners turn 45 degrees over 3.9-unit
 * chords, which is r 5.10. 5.1 / 13.35 = 0.38.
 *
 * **Which shapes should share it:** flat rectangular *plates* the characters
 * carry or stand a mark on — a held sign's board, the half-painted board in
 * the sign-painting scene, a plaque, a badge face, a button a mascot is
 * pointing at. Those are the shapes a viewer reads as "a piece of School of
 * Gaming", and giving them one rounding rule is what makes a prop look like it
 * came out of the same box as the logo.
 *
 * **Which should not:** anything that is not a plate. A device (a controller,
 * a laptop, a phone) is moulded plastic and has its own vocabulary; a body, a
 * limb or a hat is anatomy; and a *long* plate does not want a radius of 0.38
 * of its long side — the ratio is against the shape's **shorter** dimension,
 * which is what "segment height" means on a bar, and it is a cap rather than a
 * target: on a plate much longer than it is wide the rounding is applied to
 * the short side and the long side keeps its straight run, exactly as the
 * wordmark's own bars do.
 */
export const BRAND_RADIUS = 0.38;

/** The corner radius a brand-shaped plate of these dimensions takes. */
export function brandRadius(width: number, height: number): number {
  return Math.min(width, height) * BRAND_RADIUS;
}

/**
 * The two brand pairs, as bodies.
 *
 * Jalo is the mark with a face, so its first colourway is not a mascot colour
 * at all: it is `BRAND.primary` under `BRAND.primaryForeground`, which is the
 * exact pair the favicon cuts its chevron with and the pair the product's own
 * buttons already use. The second is the white-on-purple candidate — the
 * secondary brand colour with its own foreground as the face's ink.
 *
 * Both come from the brand constants rather than from the swatch table on
 * purpose. The zone amber (`#f7a31f`) and the brand amber (`#FAA901`) are
 * three points apart and would look identical in a lineup, but only one of
 * them is the logo, and a mascot whose whole pitch is "this is the mark" has
 * to be painted with the mark's own value so a retune of the brand reaches it.
 *
 * The limbs go the opposite way on the two of them, which is the same rule the
 * species applies to every swatch body: deepen a light body's stems, lift a
 * dark one's, because a stem has to separate from the body above it and from
 * the page behind it at once.
 */
export const JALO_VARIANTS: readonly VariantDef[] = [
  {
    id: "jalo",
    label: "Jalo",
    note: "The favicon's own pair — brand amber under the near-black its chevron is cut in",
    colors: colorwayFromSwatch(
      BRAND.primary,
      { clothing: BRAND.secondary, clothingAccent: MASCOT_INK.paper },
      {
        limb: shadeHex(BRAND.primary, 0.28),
        pupil: BRAND.primaryForeground,
        ink: BRAND.primaryForeground,
      },
    ),
  },
  {
    id: "secondary",
    label: "Secondary purple",
    note: "The white-on-purple mark (SX2) — brand purple with its own foreground as the ink",
    colors: colorwayFromSwatch(
      BRAND.secondary,
      { clothing: BRAND.primary, clothingAccent: MASCOT_INK.paper },
      { limb: tintHex(BRAND.secondary, 0.22), ink: BRAND.secondaryForeground },
    ),
  },
];

// --- Lohi: the cute dragon cast ------------------------------------------

/**
 * The river colours.
 *
 * *Lohikäärme* is the Finnish for dragon and *lohi* on its own is a salmon, so
 * the species is named for the fish, its members are named for the rivers the
 * fish runs up, and its flagship body is salmon-pink. That last one is the only
 * colour in this file that is a *mix* of two swatches rather than one of them:
 * neither the zone pink (`#f767a8`, too magenta) nor the zone red (`#f4504e`,
 * too tomato) is a salmon on its own, and the point of naming a species after a
 * fish is lost if the fish's own colour is the one thing the palette cannot
 * make. Halfway between them, lifted an eighth towards the shared paper, is
 * the colour — and it is still two swatches and two helpers rather than a hex
 * somebody typed.
 *
 * The other four are single swatches, one per hue family, so a cast of five
 * standing together is five different animals rather than five shades of one:
 * a cyan, a deep indigo-blue, a warm orange and a green. Every garment pair is
 * another swatch, and every limb is deepened a little past what
 * `colorwayFromSwatch` gives on its own, because a dragon's legs are drawn
 * against its own belly plane rather than against open space.
 */
const LOHI_SALMON = tintHex(mixHex(swatchHex("pink"), swatchHex("red"), 0.5), 0.12);

/** One river colourway: a body swatch, a garment swatch, deepened limbs. */
function lohiColorway(body: string, garment: string): Colorway {
  return colorwayFromSwatch(
    body,
    { clothing: garment, clothingAccent: tintHex(garment, 0.84) },
    {
      limb: shadeHex(body, 0.26),
      // The `spark` slot is the species' one loud colour, and on this species
      // it is literally a spark: the puff of flame an excited Lohi lets out.
      // It is the same amber on all five rivers rather than a shade of each
      // body, for two reasons. Fire is amber whatever is breathing it — a
      // green flame off the reed-green one would be a colourway artefact, not
      // a decision — and the derived default (`shadeHex(hex, 0.52)`) is a
      // *darker* version of the body, which is exactly the wrong value for the
      // one mark in this drawing that floats in open air on a near-black page.
      spark: swatchHex("amber"),
    },
  );
}

export const LOHI_VARIANTS: readonly VariantDef[] = [
  {
    id: "lohi",
    label: "Lohi",
    note: "The flagship — salmon, halfway between the zone pink and the zone red",
    colors: lohiColorway(LOHI_SALMON, swatchHex("teal")),
  },
  {
    id: "koski",
    label: "Koski",
    note: "Rapids — the zone cyan, the brightest water in the table",
    colors: lohiColorway(swatchHex("cyan"), swatchHex("amber")),
  },
  {
    id: "virta",
    label: "Virta",
    note: "The deep current — zone indigo under engineering gold",
    colors: lohiColorway(swatchHex("indigo"), swatchHex("amber")),
  },
  {
    id: "nuotio",
    label: "Nuotio",
    note: "Campfire — the zone orange, for the one dragon that admits to the fire",
    colors: lohiColorway(swatchHex("orange"), swatchHex("sky")),
  },
  {
    id: "kaisla",
    label: "Kaisla",
    note: "Reed — the zone emerald, the riverbank one",
    colors: lohiColorway(swatchHex("emerald"), swatchHex("purple")),
  },
];

// --- Marja: the berries --------------------------------------------------

/**
 * The one green this species owns.
 *
 * A berry's leaf, its calyx, its stalk and its two stem legs are all the same
 * plant, so they are all the same colour — one flat green shared by every
 * form and every colourway, against a body that changes. That is the
 * simplicity ruling applied to a whole species at once: the *berry* is the
 * variable and everything botanical about it is the constant, so a viewer
 * learns one shape language and reads five characters out of it.
 *
 * Shaded off the zone green rather than invented, and only a fifth of the way,
 * because it has to stay visible as a twenty-unit leaf on a `#121212` page.
 */
export const MARJA_LEAF = shadeHex(swatchHex("green"), 0.22);

/**
 * Five berries, four of which are a form's own colour.
 *
 * The colourway is where a berry's identity actually lives — a blueberry that
 * is not blue is not a blueberry — so unlike every other species here the
 * variant and the form are a *matched pair* rather than two free axes. They
 * are still two axes, because the machinery has no way to say otherwise and
 * because the pairing being breakable is what lets the fleet field a second
 * strawberry in a different red without a second form. But the fleet names
 * both, always, and anything generated (an avatar) should too.
 *
 * The two reds are the honest problem in the set and are separated by
 * measurement rather than by name: a lingonberry is a deeper, browner crimson
 * than a strawberry, so `puolukka` is the zone red taken a quarter of the way
 * to the shadow and `mansikka` is the zone red untouched. Held side by side at
 * 40px they are two different berries; held alone, either reads as "red
 * berry", which is the correct answer for both.
 *
 * `ink` is set by luminance on the same rule Silmu uses: a body under about a
 * third of the page's brightness swallows the shared near-black, so the mouth
 * glyph and the brows flip to paper. Four of these five are under it, which is
 * what a species made of saturated fruit colours looks like.
 */
const MARJA_GARMENT = { clothing: swatchHex("teal"), clothingAccent: MASCOT_INK.paper };

export const MARJA_VARIANTS: readonly VariantDef[] = [
  {
    id: "mustikka",
    label: "Mustikka",
    note: "Blueberry — the zone indigo taken towards the shadow, which is where a bilberry lives",
    colors: colorwayFromSwatch(shadeHex(swatchHex("indigo"), 0.3), MARJA_GARMENT, {
      limb: MARJA_LEAF,
      ink: MASCOT_INK.paper,
    }),
  },
  {
    id: "puolukka",
    label: "Puolukka",
    note: "Lingonberry — the zone red a quarter of the way down, the deeper of the two reds",
    colors: colorwayFromSwatch(shadeHex(swatchHex("red"), 0.24), MARJA_GARMENT, {
      limb: MARJA_LEAF,
      ink: MASCOT_INK.paper,
    }),
  },
  {
    id: "lakka",
    label: "Lakka",
    note: "Cloudberry — the zone amber, the only body here light enough to keep the shared ink",
    colors: colorwayFromSwatch(swatchHex("amber"), MARJA_GARMENT, { limb: MARJA_LEAF }),
  },
  {
    id: "mansikka",
    label: "Mansikka",
    note: "Strawberry — the zone red untouched, the brighter of the two",
    colors: colorwayFromSwatch(swatchHex("red"), MARJA_GARMENT, {
      limb: MARJA_LEAF,
      ink: MASCOT_INK.paper,
    }),
  },
  {
    id: "vadelma",
    label: "Vadelma",
    note: "Raspberry — the zone pink; a colourway with no form of its own, so the species can recolour",
    colors: colorwayFromSwatch(swatchHex("pink"), MARJA_GARMENT, { limb: MARJA_LEAF }),
  },
];

// --- Sieni: the mushrooms ------------------------------------------------

/**
 * The one cream this species owns.
 *
 * Every mushroom here has the same stem, and that is the whole design: the
 * *cap* carries identity and the stem is a constant, so four characters are
 * told apart by one block of colour at the top of the silhouette and by
 * nothing else. It is the same trick the berries play with their green,
 * turned upside down — there, the botany is the constant and the fruit varies;
 * here the flesh is the constant and the cap varies.
 *
 * Tinted two thirds of the way off the zone yellow rather than taken from the
 * shared paper, and the exact fraction is a legibility measurement rather than
 * a taste. The first pass tinted 0.86 and landed on `#fcf0ce`, three points
 * from the shared paper the eye whites are drawn in — so on the raster the
 * whites vanished into the stem and every mushroom in the family had two black
 * dots for a face. At 0.68 the cream is a warm `#f8e7ad`, which still reads as
 * mushroom flesh and leaves the eye somewhere to be.
 */
export const SIENI_CREAM = tintHex(swatchHex("yellow"), 0.68);

/**
 * Four caps.
 *
 * `tatti` is the one colour in this module that is not a swatch and not a
 * brand value: there is no brown in the product's palette, and a porcini that
 * is not brown is not a porcini. It is the zone orange taken half way to the
 * shadow, which is a derivation rather than an invention — the same operation
 * every other body in this file goes through, just further along it — and it
 * means a retune of the orange still reaches it.
 *
 * `panel` is the stem and is overridden to the shared cream on three of the
 * four. The chanterelle keeps its derived tint instead, because a chanterelle
 * really is one colour from cap to foot and giving it a cream stem would have
 * made it a small tatti in a yellow hat.
 *
 * No `ink` override anywhere, which is the quiet reward for putting the face
 * on the stem rather than on the cap: the face is always drawn on the same
 * pale block whatever the cap is doing, so the shared near-black always reads
 * and a mood never has to be re-tuned per colourway.
 */
const SIENI_GARMENT = { clothing: swatchHex("emerald"), clothingAccent: MASCOT_INK.paper };

export const SIENI_VARIANTS: readonly VariantDef[] = [
  {
    id: "kantarelli",
    label: "Kantarelli",
    note: "Chanterelle — the zone amber, cap and stem both, because the real one has no join",
    colors: colorwayFromSwatch(swatchHex("amber"), SIENI_GARMENT, {
      panel: tintHex(swatchHex("amber"), 0.28),
      limb: shadeHex(swatchHex("amber"), 0.22),
    }),
  },
  {
    id: "vahvero",
    label: "Vahvero",
    note: "The pale chanterelle — the same cap tinted, on the shared cream stem",
    colors: colorwayFromSwatch(tintHex(swatchHex("amber"), 0.42), SIENI_GARMENT, {
      panel: SIENI_CREAM,
      limb: shadeHex(SIENI_CREAM, 0.16),
    }),
  },
  {
    id: "tatti",
    label: "Tatti",
    note: "Porcini — the zone orange half way to the shadow, the only brown the palette can make",
    colors: colorwayFromSwatch(shadeHex(swatchHex("orange"), 0.5), SIENI_GARMENT, {
      panel: SIENI_CREAM,
      limb: shadeHex(SIENI_CREAM, 0.16),
    }),
  },
  {
    id: "karpassieni",
    label: "Kärpässieni",
    note: "Fly agaric — the zone red under its own white dots, which are the form rather than the colourway",
    colors: colorwayFromSwatch(swatchHex("red"), SIENI_GARMENT, {
      panel: SIENI_CREAM,
      limb: shadeHex(SIENI_CREAM, 0.16),
    }),
  },
];

/**
 * The brand's amber, named for the art that has to be *gold* rather than
 * merely warm.
 *
 * The swatch table's amber (`#f7a31f`) and this (`#FAA901`) are three points
 * apart and indistinguishable side by side, so most drawings should keep
 * using the swatch: a hat, a garment or a body is a mascot colour and belongs
 * on the mascot palette. This is for the handful of marks that are *the
 * company's* rather than the character's — a crown that is somebody's
 * landmark, a badge patch carrying the stripe-S — where the value has to
 * follow the brand if the brand is ever retuned.
 */
export const BRAND_GOLD = BRAND.primary;

// --- Galaksi: the alien crew ---------------------------------------------

/**
 * Six skins, all from the cold half of the wheel.
 *
 * The species is an alien crew and the one thing every drawn alien in the
 * world agrees about is that its skin is a colour no mammal is. The swatch
 * table has eight of those and this takes six — teal, cyan, sky, indigo,
 * violet and lime — which is a whole fleet that is unmistakably *not people*
 * without a single hex being invented for it. The warm half is deliberately
 * absent: an amber or a red body is a mammal, a berry or a fire, and the
 * moment one stands in this lineup the group stops reading as a crew.
 *
 * Garments go the other way on purpose. Every one of them is a warm swatch,
 * because the only garments this species wears are a helmet rim and a suit
 * band, and a cool trim on a cool skin is a band nobody can see at 40 pixels.
 * One warm ring around a cold head is also, usefully, exactly what a space
 * helmet looks like.
 *
 * `ink` follows the same measured rule the bean uses: a body under about a
 * third of the page's brightness swallows the shared near-black, so the mouth
 * glyph and the brows flip to paper there. Measured, the six are teal 0.53,
 * lime 0.51, cyan 0.51, sky 0.40, violet 0.25 and indigo 0.23 — so it is the
 * last two that flip, and the gap either side of the line is wide enough that
 * nobody has to re-tune it when a zone hue moves.
 */
function galaksiColorway(body: string, garment: string, paperInk = false): Colorway {
  return colorwayFromSwatch(
    body,
    { clothing: garment, clothingAccent: tintHex(garment, 0.82) },
    {
      // Much deeper than the helper's own limb, because this species spends
      // three values on a figure and this is the third: a bright cranium, a
      // mid body, and limbs darker than either. Its arms hang *against* that
      // body and its legs stand *against* the page, so a limb one step off
      // the skin — the helper's default — disappears into one or the other.
      limb: shadeHex(body, 0.42),
      ...(paperInk ? { ink: MASCOT_INK.paper } : {}),
    },
  );
}

export const GALAKSI_VARIANTS: readonly VariantDef[] = [
  {
    id: "revontuli",
    label: "Revontuli",
    note: "Aurora — the zone teal, the flagship skin",
    colors: galaksiColorway(swatchHex("teal"), swatchHex("amber")),
  },
  {
    id: "komeetta",
    label: "Komeetta",
    note: "Comet — the zone cyan, the brightest of the six",
    colors: galaksiColorway(swatchHex("cyan"), swatchHex("orange")),
  },
  {
    id: "tahtisumu",
    label: "Tähtisumu",
    note: "Nebula — the zone violet; dark enough that the face flips to paper",
    colors: galaksiColorway(swatchHex("violet"), swatchHex("amber"), true),
  },
  {
    id: "plasma",
    label: "Plasma",
    note: "Plasma — the zone lime, the one skin in the set that is nearly warm",
    colors: galaksiColorway(swatchHex("lime"), swatchHex("purple")),
  },
  {
    id: "kiertorata",
    label: "Kiertorata",
    note: "Orbit — the zone sky, the calm one",
    colors: galaksiColorway(swatchHex("sky"), swatchHex("red")),
  },
  {
    id: "syvyys",
    label: "Syvyys",
    note: "The deep — the zone indigo, the darkest body here and the second on paper ink",
    colors: galaksiColorway(swatchHex("indigo"), swatchHex("yellow"), true),
  },
];

// --- Reksi: the T-rex Princi-Pal's own slate ------------------------------

/**
 * The grey-blue the legacy sog.gg site draws Reksi's T-rex in.
 *
 * Sampled off `scratchpad/sogg-zoom.png` at working size, five points across
 * the figure: cheek and thigh `#749ea1`, tail shadow `#42595b`, belly
 * `#c2e1e3`, toes `#ddf0f4`. It is a desaturated cyan-blue — a slate with the
 * chroma mostly taken out of it — which is not a colour the twenty-four
 * swatches contain and is not a colour anybody should type in either.
 *
 * So it is mixed, the way the rat's grey is: `sky` knocked down with `amber`,
 * its near-complement, cancels almost all the chroma and leaves the hue where
 * the sample has it, and a light shade lands the value. The mix comes out at
 * `#739fa1` against the sampled `#749ea1` — within two points on every
 * channel, and it moves if the zone hues are ever retuned instead of quietly
 * drifting away from them.
 */
export const REKSI_SLATE = shadeHex(mixHex(swatchHex("sky"), swatchHex("amber"), 0.35), 0.08);

/**
 * The pale underside: belly, muzzle, toes.
 *
 * `colorwayFromSwatch` would derive this by tinting the body, and on a colour
 * this close to neutral that produces a warm grey — the sample is distinctly
 * *blue* (`#c2e1e3`), because on the legacy drawing the belly is the one place
 * the coat's own hue is allowed to show. Tinting the untouched `sky` instead
 * keeps that.
 */
const REKSI_PALE = tintHex(swatchHex("sky"), 0.72);

/**
 * Reksi's coat, and only his.
 *
 * A single-member colourway is unusual in this file and is the point: the
 * whole species is a fleet of animals told apart by colour, and this is the
 * one animal in it that is a named person. The garment pair is the purple
 * jacket and the amber of the SOG badge from `REKSI.png`, which is the same
 * pair his human build already wears.
 */
export const REKSI_VARIANTS: readonly VariantDef[] = [
  {
    id: "reksi",
    label: "Reksi",
    note: "The Princi-Pal's slate — sky knocked down with amber, off the legacy sog.gg T-rex",
    colors: colorwayFromSwatch(
      REKSI_SLATE,
      { clothing: swatchHex("purple"), clothingAccent: swatchHex("amber") },
      {
        panel: REKSI_PALE,
        // The back ridge and the tail's far edge. A shade of the body rather
        // than the derived `spark` (which lands near-white here and would make
        // a row of pale blobs along the back), so `markingHex` reads it as a
        // marking and every form in the family that paints from `spark` keeps
        // working on this coat.
        spark: shadeHex(REKSI_SLATE, 0.42),
      },
    ),
  },
];

// --- Otso, the cute-animal round: penguin, otter, hedgehog ----------------

/**
 * Three more Otso coats, for the round Kyle asked for by name — "penguin,
 * otter, or hedgehog — those are all cute animals that deserve their own
 * mascot / character ideas."
 *
 * Same rules as the cast cohort above: every value is mixed off
 * `MASCOT_SWATCHES`, and the two colours the swatch list has no name for — a
 * blue-black and a river brown — are reached by mixing swatches rather than
 * by typing a hex, so they move if the zone hues are ever retuned.
 *
 * The one thing worth knowing before reading them: this family paints hands
 * and feet from `panel`, the same slot a muzzle and a belly come out of. On
 * these three that is exactly right twice (a hedgehog's paws and an otter's
 * are the pale of its muzzle) and one shade off once — the legacy penguin has
 * *pink* feet under a yellow belly, and giving him those would mean a
 * per-form limb paint, which is a change to `ConceptDef` and to every concept
 * in the directory rather than a colour. The beak carries the pink instead.
 */

/**
 * The penguin's back, hood and flippers: a blue-black.
 *
 * Sampled off `scratchpad/polonski-zoom.png`, the legacy drawing is scribbled
 * pure black on white paper — the same problem the one-eyed bean and the soot
 * monster have, and the same answer: pure black on a `#121212` page is a hole
 * rather than a character. `indigo` and `blue` are the two swatches nearest
 * the blue-black a penguin's back actually is; mixed and taken most of the way
 * down they land dark enough to read as the dark half of a two-block animal
 * and light enough to have an edge against the page.
 */
const PINGVIINI_SLATE = shadeHex(mixHex(swatchHex("indigo"), swatchHex("blue"), 0.5), 0.72);

/**
 * The otter's coat: a river brown, and deliberately not the beaver's.
 *
 * Two brown round animals in one family is a colour problem before it is a
 * drawing problem — `majava` is `orange` taken down to a warm timber, so this
 * one goes the other way round the wheel: `amber` pulled towards `violet`
 * kills the orange in it and leaves a cool mahogany that reads as *wet*, which
 * is the one thing an otter is and a beaver, drawn dry on a riverbank, is not.
 */
const SAUKKO_BROWN = shadeHex(mixHex(swatchHex("amber"), swatchHex("violet"), 0.3), 0.58);

/**
 * The hedgehog's spines and coat: a warm taupe.
 *
 * `amber` knocked a third of the way towards `indigo` cancels most of the
 * chroma without going grey, and `colorwayFromSwatch` then derives the two
 * tones the form needs from it in the usual proportions: the mantle is the
 * shade, the face and belly are the tint. No override at all — this is the
 * only coat in the round that the standard mixer gets right on its own.
 */
const SIILI_TAN = mixHex(swatchHex("amber"), swatchHex("indigo"), 0.36);

export const OTSO_CUTE_VARIANTS: readonly VariantDef[] = [
  {
    id: "pingviini",
    label: "Pingviini",
    note: "Polonski's own two blocks — a blue-black hood over a butter-yellow front",
    colors: colorwayFromSwatch(
      PINGVIINI_SLATE,
      // The green sweater is the legacy character's, and it is the one thing
      // about him nobody has to be told twice.
      { clothing: swatchHex("green"), clothingAccent: MASCOT_INK.paper },
      {
        // The front is yellow rather than white, because the drawing's is:
        // the face and belly are one continuous `#f9e04b`-ish block and the
        // black is only ever a frame around it. Taken half way to paper so it
        // stays a *pale* front — a saturated yellow belly under a black hood
        // is a chick, not a penguin.
        panel: tintHex(swatchHex("yellow"), 0.5),
        // The beak, and the only loud colour on the animal. Measured off the
        // reference at working size: the beak is a 33px triangle on a 418px
        // face, so eight per cent of the head's width, in the same magenta as
        // the feet.
        accent: swatchHex("pink"),
        // The flippers and the tail wedge. A step under the back rather than
        // the mixer's third-of-the-way-to-shadow, which on a colour this dark
        // already lands at the page's own black.
        bodyBottom: shadeHex(PINGVIINI_SLATE, 0.18),
        limb: PINGVIINI_SLATE,
      },
    ),
  },
  {
    id: "saukko",
    label: "Saukko",
    note: "River brown — amber pulled towards violet and taken down, with a wheat muzzle",
    colors: colorwayFromSwatch(
      SAUKKO_BROWN,
      { clothing: swatchHex("cyan"), clothingAccent: MASCOT_INK.paper },
      {
        // The muzzle, the throat and the belly. Tinting the *coat* the way the
        // mixer would gives a mauve-grey, because this brown has violet in it
        // on purpose; tinting the untouched `amber` instead keeps the pale
        // block warm, which is what separates the muzzle from the coat at
        // portrait size.
        panel: tintHex(swatchHex("amber"), 0.72),
      },
    ),
  },
  {
    id: "siili",
    label: "Siili",
    note: "Spine taupe — amber knocked towards indigo, the mantle one shade under the coat",
    colors: colorwayFromSwatch(SIILI_TAN, {
      clothing: swatchHex("emerald"),
      clothingAccent: MASCOT_INK.paper,
    }),
  },
];
