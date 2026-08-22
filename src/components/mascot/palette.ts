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

import { BRAND, YTY_ELEMENT } from "@/lib/constants/colors";

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
  /** Cheek blush. */
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
