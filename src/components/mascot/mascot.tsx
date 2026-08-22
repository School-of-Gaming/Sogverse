"use client";

/**
 * `<Mascot>` — one component, every character.
 *
 * It assembles a picture out of six independent tables: a concept (the base
 * model), a colourway, a pose, an expression, an outfit and a prop. None of
 * them knows about the others, which is what keeps the combinatorics free:
 * eleven poses times six expressions times sixteen accessories is not
 * something anyone drew, it is something the assembly produces.
 *
 * Three properties are load-bearing and worth stating plainly.
 *
 * **The picture never depends on the app's CSS.** Every fill, stroke and
 * coordinate is an SVG attribute. The only stylesheet involved is the tiny one
 * this component writes *inside* the SVG for the idle animation, so lifting
 * the rendered `outerHTML` out of the page gives a standalone `.svg` file that
 * needs no build step, and stripping the animation leaves the identical
 * still image an email or a rasteriser will see.
 *
 * **Identity is not customisable.** The outfit layer adds and repaints
 * garments; it cannot touch the body, head, eyes or species accent. That is a
 * structural guarantee rather than a convention — accessories are handed the
 * anchors and the garment colour slots and nothing else — and it is what would
 * make a gamer-facing customiser safe to build on this later.
 *
 * **Level of detail is part of the design, not an afterthought.** Below about
 * ninety pixels the filigree stops rendering and below forty the props and the
 * small face items go too, so the character gets *simpler* as it gets smaller
 * rather than muddier.
 */

import { useId, type CSSProperties, type ReactElement } from "react";

import { accessory, accessoryFits, accessoryVisible } from "./accessories";
import { animationClasses, animationCss, safeId, seedFrom } from "./animation";
import type { ConceptId, LimbPaint } from "./concept";
import { getConcept } from "./concepts";
import {
  detailForSize,
  showsProps,
  type DetailLevel,
  type MascotCrop,
} from "./detail";
import { Face } from "./face";
import { ArmLimb, Hand, Legs } from "./limbs";
import { anchorsFor, ROLE_OUTFITS, type Outfit, type OutfitSlot } from "./outfit";
import { MASCOT_INK, type ColorOverride, type Colorway } from "./palette";
import { POSES, propAnchor } from "./poses";
import { HeldProp } from "./props";
import { MASCOT_BASELINE, MASCOT_VIEWBOX, originOf } from "./rig";
import {
  POSE_LABELS,
  ROLE_DEFAULT_PROP,
  ROLE_LABELS,
  type ExpressionId,
  type MascotRole,
  type PoseId,
  type PropId,
} from "./vocabulary";

export type MascotProps = {
  /** Which base model. */
  concept: ConceptId;
  /** Which of that concept's colourways. Falls back to its first. */
  variant?: string;
  pose?: PoseId;
  expression?: ExpressionId;
  /** A role is a saved outfit plus a default prop. */
  role?: MascotRole;
  /** Worn items, merged over whatever the role already put on. */
  outfit?: Outfit;
  /** Repaints garment colour slots. Cannot reach the identity core. */
  colors?: ColorOverride;
  /** Overrides the pose's and the role's choice of held object. */
  prop?: PropId;
  /** Rendered pixel size. The SVG is square. */
  size?: number;
  /** Forces a level of detail; otherwise derived from `size`. */
  detail?: DetailLevel;
  /** Framing. `bust` and `head` are the avatar crops. */
  crop?: MascotCrop;
  /** Idle motion. Off gives the exact same picture, standing still. */
  animated?: boolean;
  /**
   * Flattens the whole character to one colour. A design has to survive as a
   * silhouette or its identity is living in the detail, so this is a test
   * surface rather than a decoration.
   */
  silhouette?: boolean;
  /** Overrides the generated description. */
  label?: string;
  className?: string;
};

/** Head-and-shoulders framings, as viewBox windows onto the same drawing. */
function viewBoxFor(crop: MascotCrop, headX: number, headY: number, headR: number): string {
  if (crop === "full") return MASCOT_VIEWBOX;
  const side = crop === "bust" ? headR * 3.2 : headR * 2.6;
  const cy = crop === "bust" ? headY + headR * 0.62 : headY + headR * 0.12;
  return `${headX - side / 2} ${cy - side / 2} ${side} ${side}`;
}

/** Slot draw order behind the body, and in front of it. */
const BEHIND_SLOTS: readonly OutfitSlot[] = ["back"];
const TORSO_SLOTS: readonly OutfitSlot[] = ["torso"];
const HEAD_SLOTS: readonly OutfitSlot[] = ["hat", "face"];
const GROUND_SLOTS: readonly OutfitSlot[] = ["extra"];

export function Mascot({
  concept,
  variant,
  pose = "idle",
  expression = "happy",
  role = "none",
  outfit,
  colors: colorOverride,
  prop,
  size = 160,
  detail,
  crop = "full",
  animated = true,
  silhouette = false,
  label,
  className,
}: MascotProps): ReactElement {
  const def = getConcept(concept);
  const uid = safeId(useId());
  const cls = animationClasses(uid);
  const level = detail ?? detailForSize(size);

  const chosen = def.variants.find((v) => v.id === variant) ?? def.variants[0];
  const palette: Colorway = { ...chosen.colors, ...colorOverride };
  const paint: LimbPaint = def.limbs(palette);
  const rig = def.rig;
  const spec = POSES[pose];
  const anchors = anchorsFor(rig);

  // A role dresses the character; an explicit outfit is layered over the top,
  // so a caller can put a party hat on a gedu without losing the lanyard.
  const worn: Outfit = { ...ROLE_OUTFITS[role], ...outfit };

  // The pose picks the prop when it implies one (a reading pose needs a book);
  // otherwise the role fills an idle hand, but only when that hand is free.
  const roleProp = spec.freeHand ? ROLE_DEFAULT_PROP[role] : "none";
  const heldProp = prop ?? (spec.defaultProp === "none" ? roleProp : spec.defaultProp);

  const parts = { rig, colors: palette, variantId: chosen.id, detail: level };
  const floatClass = animated ? cls.float : "";
  const waving = animated && spec.waveArm === "R";

  const drawSlots = (slots: readonly OutfitSlot[]): ReactElement[] =>
    slots.flatMap((slot) => {
      const id = worn[slot];
      if (id === undefined) return [];
      const item = accessory(id);
      if (item === undefined) return [];
      if (!accessoryFits(item, def.id) || !accessoryVisible(item, level)) return [];
      return [
        <g key={slot}>{item.render({ anchors, rig, colors: palette, detail: level })}</g>,
      ];
    });

  const described =
    label ??
    `${def.species} mascot, ${chosen.label} colourway${role === "none" ? "" : `, dressed as a ${ROLE_LABELS[role].toLowerCase()}`}, ${POSE_LABELS[pose].toLowerCase()}`;

  const flatten: CSSProperties | undefined = silhouette
    ? { filter: "brightness(0)" }
    : undefined;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBoxFor(crop, rig.head.x, rig.head.y, rig.head.r)}
      width={size}
      height={size}
      role="img"
      aria-label={described}
      className={className}
    >
      {animated && <style>{animationCss(uid, seedFrom(uid))}</style>}
      {!silhouette && (
        <ellipse
          cx={rig.shadow.cx}
          cy={rig.shadow.cy}
          rx={rig.shadow.rx}
          ry={rig.shadow.ry}
          fill={MASCOT_INK.shadow}
          opacity={0.45}
        />
      )}
      <g className={animated ? cls.bob : undefined} style={flatten}>
        <g
          className={animated ? cls.breathe : undefined}
          style={{ transformOrigin: originOf(MASCOT_BASELINE) }}
        >
          {drawSlots(BEHIND_SLOTS)}
          <Legs rig={rig} paint={paint} legs={spec.legs} />
          <def.Body {...parts} floatClass={floatClass} />
          {drawSlots(TORSO_SLOTS)}
          <g
            className={animated && !rig.fusedHead ? cls.tilt : undefined}
            style={rig.fusedHead ? undefined : { transformOrigin: originOf({ x: rig.head.x, y: rig.head.y + rig.head.r * 0.9 }) }}
          >
            <def.Head {...parts} floatClass={floatClass} />
            {def.Crown !== undefined && <def.Crown {...parts} floatClass={floatClass} />}
            <Face
              rig={rig}
              colors={palette}
              expression={expression}
              mode={def.faceMode}
              detail={level}
              blinkClass={animated ? cls.blink : ""}
            />
            {drawSlots(HEAD_SLOTS)}
          </g>
          <ArmLimb rig={rig} paint={paint} from={rig.shoulderL} to={spec.handL} bow={spec.bowL} />
          {!waving && (
            <ArmLimb rig={rig} paint={paint} from={rig.shoulderR} to={spec.handR} bow={spec.bowR} />
          )}
          {showsProps(level) && (
            <HeldProp prop={heldProp} at={propAnchor(spec)} colors={palette} />
          )}
          <Hand rig={rig} paint={paint} at={spec.handL} />
          {!waving && <Hand rig={rig} paint={paint} at={spec.handR} />}
          {waving && (
            <g className={cls.wave} style={{ transformOrigin: originOf(rig.shoulderR) }}>
              <ArmLimb rig={rig} paint={paint} from={rig.shoulderR} to={spec.handR} bow={spec.bowR} />
              <Hand rig={rig} paint={paint} at={spec.handR} />
            </g>
          )}
          {drawSlots(GROUND_SLOTS)}
        </g>
      </g>
    </svg>
  );
}
