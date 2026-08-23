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
