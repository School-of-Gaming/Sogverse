/**
 * What a base model is, as a type.
 *
 * A concept supplies four things and inherits everything else: a rig (where
 * its joints are), a set of colourways, a body and a head. Poses, expressions,
 * props and role costumes are shared machinery that reads the rig, so a new
 * species is roughly a hundred lines and immediately has eleven poses, six
 * expressions, twelve props and three costumes. That ratio is the point of the
 * whole directory — it is what makes a fleet maintainable by a model editing
 * TSX rather than by an illustrator redrawing sheets.
 */

import type { ReactElement } from "react";

import type { DetailLevel } from "./detail";
import type { FaceMode } from "./face";
import type { Colorway, VariantDef } from "./palette";
import type { Rig } from "./rig";
import type { OutfitSlot } from "./outfit";
import type { ExpressionId, MascotRole, PoseId, PropId } from "./vocabulary";

export const CONCEPT_IDS = ["ytymo", "konsu", "otso", "kaveri", "taitto"] as const;
export type ConceptId = (typeof CONCEPT_IDS)[number];

/** What every concept-supplied part receives. */
export type PartProps = {
  rig: Rig;
  colors: Colorway;
  /** Which colourway is in play — the only thing a part may branch on. */
  variantId: string;
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
  role: MascotRole;
  pose: PoseId;
  expression: ExpressionId;
  prop?: PropId;
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
  rig: Rig;
  faceMode: FaceMode;
  variants: readonly VariantDef[];
  limbs: (colors: Colorway) => LimbPaint;
  Body: (props: PartProps) => ReactElement;
  Head: (props: PartProps) => ReactElement;
  /** The floating thing above the head, if the species has one. */
  Crown?: (props: PartProps) => ReactElement | null;
  fleet: readonly FleetMember[];
};
