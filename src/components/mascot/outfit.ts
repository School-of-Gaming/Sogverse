/**
 * The paper-doll layer: what a character can wear, and where it hangs.
 *
 * The rule the whole system exists to enforce is that **customisation never
 * touches identity**. A base model is its silhouette, its head shape, its eyes
 * and its one signature landmark — the parts that have to survive at 24
 * pixels. An outfit may add layers on top of that and may repaint the
 * *garment* colour slots. It may not change the body, the head, the eyes or
 * the species accent, so no combination of hats and hoodies can turn one
 * character into a different one, and a gamer who has been let loose on a
 * customiser still ends up with something recognisably ours.
 *
 * Slots are anchored to the rig, and the anchors are read *inside* the pose's
 * own transform group. That is what makes a hat stay on the head through a
 * jump: the accessory knows nothing about the pose, it just draws at the
 * crown, and the pose moves the crown.
 *
 * The data shape is deliberately dull — `{ hat: "beanie", torso: "hoodie" }`
 * plus a partial colour override — because the point is that a future
 * gamer-facing customiser could store exactly this and hand it back.
 */

import type { ColorOverride } from "./palette";
import type { Rig } from "./rig";
import type { MascotRole } from "./vocabulary";

export const OUTFIT_SLOTS = ["hat", "face", "torso", "back", "extra"] as const;
export type OutfitSlot = (typeof OUTFIT_SLOTS)[number];

export const SLOT_LABELS: Record<OutfitSlot, string> = {
  hat: "Hat",
  face: "Face",
  torso: "Torso",
  back: "Back",
  extra: "Extra",
};

/** What is worn in each slot. Every slot is optional; an empty outfit is fine. */
export type Outfit = Partial<Record<OutfitSlot, string>>;

/** A full customisation: what is worn, and how the garments are painted. */
export type Customisation = { outfit: Outfit; colors: ColorOverride };

/**
 * Where each slot's contents attach. Everything is derived from the rig, so a
 * new concept gets working attachment points the moment it fills in its
 * skeleton — there is no per-species accessory positioning anywhere.
 */
export type Anchors = {
  /** Top of the head silhouette, and how wide the head is there. */
  hat: { x: number; y: number; w: number };
  /** The eye line — glasses, visors, anything worn across the face. */
  face: { x: number; y: number; dx: number; r: number };
  /** The chest box. */
  torso: { x: number; y: number; w: number; h: number };
  /** Shoulder line plus the drop below it, for capes and packs. */
  back: { x: number; y: number; w: number; drop: number };
  /** The ground, just off the character's left foot. */
  extra: { x: number; y: number };
};

export function anchorsFor(rig: Rig): Anchors {
  return {
    hat: { x: rig.crown.x, y: rig.crown.y, w: rig.crownW },
    face: { x: rig.head.x, y: rig.eyeY, dx: rig.eyeDx, r: rig.eyeR },
    torso: rig.torso,
    back: {
      x: (rig.shoulderL.x + rig.shoulderR.x) / 2,
      y: Math.min(rig.shoulderL.y, rig.shoulderR.y),
      w: rig.shoulderR.x - rig.shoulderL.x,
      drop: rig.footY - rig.shoulderL.y - 12,
    },
    extra: { x: rig.shadow.cx - rig.shadow.rx - 4, y: rig.footY + 4 },
  };
}

/**
 * A role is just a saved outfit. Keeping it that way rather than as a parallel
 * costume system means the role lineup and the dress-up strip are the same
 * machinery, and a seasonal variant of a role costume costs nothing.
 */
export const ROLE_OUTFITS: Record<MascotRole, Outfit> = {
  none: {},
  gamer: { hat: "headset" },
  parent: { torso: "scarf" },
  gedu: { face: "specs", torso: "lanyard" },
};

/** Named outfits for the dress-up strip, and the seasonal palette each wants. */
export type OutfitPreset = {
  id: string;
  label: string;
  outfit: Outfit;
  /** Which entry in `PALETTE_PRESETS` this look is painted with. */
  paletteId: string;
};

export const OUTFIT_PRESETS: readonly OutfitPreset[] = [
  { id: "plain", label: "Plain", outfit: {}, paletteId: "native" },
  {
    id: "winter",
    label: "Winter",
    outfit: { hat: "beanie", torso: "scarf", extra: "snowdrift" },
    paletteId: "winter",
  },
  {
    id: "summer",
    label: "Summer",
    outfit: { hat: "flower-crown", torso: "tee", face: "shades" },
    paletteId: "summer",
  },
  {
    id: "halloween",
    label: "Halloween",
    outfit: { hat: "witch-hat", back: "cape", extra: "pumpkin" },
    paletteId: "halloween",
  },
  {
    id: "party",
    label: "Party",
    outfit: { hat: "party-hat", torso: "hoodie", back: "backpack" },
    paletteId: "brand",
  },
];
