/**
 * What a base model is, as a type.
 *
 * A concept supplies a rig, a set of colourways, a body and a head, and
 * inherits everything else. Poses, expressions, props and role costumes are
 * shared machinery that reads the rig, so a new species is roughly a hundred
 * lines and immediately has twelve poses, six expressions, a dozen props and
 * three costumes. That ratio is the point of the whole directory — it is what
 * makes a fleet maintainable by a model editing TSX rather than by an
 * illustrator redrawing sheets.
 *
 * ## Forms: the third axis
 *
 * Round two asked two questions that turned out to be the same question. Could
 * Kaveri be a whole family — a kid who reads girl-ish, one who reads boy-ish,
 * one who reads as neither, and the three adults to match? And could Otso be
 * more than a bear, without committing to seven pose sheets?
 *
 * Both are answered by a **form**: a named variation of one concept that may
 * change the rig and the drawing, but shares the pose table, the expression
 * set, the wardrobe and the animation. A form is not a colourway (that is
 * `variant`, and it only repaints) and it is not a costume (that is `outfit`,
 * and it only adds layers). It is the *build* — proportions, head shape, the
 * silhouette's own features.
 *
 * The cost is one switch statement inside the concept's `Head`, and the reward
 * is that six Kaveris and seven Finnish animals cost about as much as one of
 * each did.
 */

import type { ReactElement } from "react";

import type { DetailLevel } from "./detail";
import type { FaceMode } from "./face";
import type { Colorway, VariantDef } from "./palette";
import type { Rig } from "./rig";
import type { Outfit, OutfitSlot } from "./outfit";
import type { ExpressionId, MascotRole, PoseId, PropId } from "./vocabulary";

export const CONCEPT_IDS = [
  "ytymo",
  "konsu",
  "otso",
  "kaveri",
  "taitto",
  "kaari",
  "kide",
  "nappi",
  "silmu",
  "palikka",
] as const;
export type ConceptId = (typeof CONCEPT_IDS)[number];

/** A named build of one concept. See the note about forms above. */
export type FormDef = {
  id: string;
  label: string;
  /** One line on what this build is for. */
  note: string;
};

/** What every concept-supplied part receives. */
export type PartProps = {
  rig: Rig;
  colors: Colorway;
  /** Which colourway is in play. */
  variantId: string;
  /** Which build is in play. Always a real id — the concept's first by default. */
  form: string;
  /** Class for the gentle float, or empty string when static. */
  floatClass: string;
  /**
   * How much of the drawing to render. A concept must treat this as binding:
   * anything hairline belongs behind `showsFiligree`, and anything that is not
   * a big block of colour belongs behind a check for `icon`.
   */
  detail: DetailLevel;
};

/**
 * Which colour each extremity takes. Arms and legs are separate slots because
 * a dressed concept nearly always disagrees about them — a sleeve and a
 * trouser leg are two garments — and collapsing them is how a hoodie ends up
 * looking like a onesie.
 */
export type LimbPaint = { arm: string; leg: string; hand: string; foot: string };

/** A named character built on the base model. */
export type FleetMember = {
  name: string;
  /** The job they do on the site. */
  job: string;
  variantId: string;
  form?: string;
  role: MascotRole;
  pose: PoseId;
  expression: ExpressionId;
  prop?: PropId;
  /**
   * Worn items, for a species whose fleet is told apart by what it has on.
   *
   * Most concepts leave this alone: their members differ by build and
   * colourway, and the role already dresses them. It exists for the species
   * where the *hat is the character* — the legacy SOG mascot was one black
   * blob and nine hats, and a fleet built on that base model with no way to
   * name a hat would be nine identical drawings.
   */
  outfit?: Outfit;
  /**
   * Which swatch this member's garments are painted from — a `MASCOT_SWATCHES`
   * id, resolved wherever the fleet is rendered.
   *
   * A colourway paints the *body*, and on a species whose members share one
   * body it therefore cannot tell them apart. The legacy SOG cast was five
   * files named after their hats, so what separates one member from the next
   * there is the garment colour and nothing else; without this they would be
   * five identical black blobs in five identically-coloured hats.
   *
   * It is a swatch id rather than a hex on purpose: the same closed list of
   * colours the product already owns, so a fleet cannot quietly introduce a
   * twenty-fifth green.
   */
  garment?: string;
  blurb: string;
};

export type ConceptDef = {
  id: ConceptId;
  /** The species name. */
  species: string;
  /** The one-line "what is it". */
  kind: string;
  /** Whether it extends the existing Yty lore or starts clean. */
  origin: "yty" | "fresh";
  /** Where this one came from, when it is a branch off another concept. */
  branchOf?: ConceptId;
  /** The pitch — who it wins over and why it is not like the others. */
  pitch: string;
  /** Honest limitations, shown next to the pitch. */
  caveat: string;
  /** What carries the identity when the character is 24 pixels tall. */
  landmark: string;
  /** Which attachment slots this species can actually use. */
  slots: readonly OutfitSlot[];
  /** What it cannot wear, and why. Empty when it can wear everything. */
  wardrobeLimit: string;
  /** The default build's skeleton. */
  rig: Rig;
  /** The named builds, when a concept has more than one. */
  forms?: readonly FormDef[];
  /** The skeleton for a given build. Defaults to `rig` for every form. */
  rigFor?: (form: string) => Rig;
  faceMode: FaceMode;
  variants: readonly VariantDef[];
  limbs: (colors: Colorway) => LimbPaint;
  Body: (props: PartProps) => ReactElement;
  Head: (props: PartProps) => ReactElement;
  /** The floating thing above the head, if the species has one. */
  Crown?: (props: PartProps) => ReactElement | null;
  fleet: readonly FleetMember[];
};

/** The build a concept uses when the caller does not name one. */
export function defaultForm(def: ConceptDef): string {
  return def.forms?.[0]?.id ?? "default";
}

/** The skeleton for a concept in a given build. */
export function rigOf(def: ConceptDef, form: string): Rig {
  return def.rigFor?.(form) ?? def.rig;
}
