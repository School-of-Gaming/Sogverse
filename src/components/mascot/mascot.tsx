"use client";

/**
 * `<Mascot>` — one component, every character.
 *
 * It assembles a picture out of seven independent tables: a concept (the base
 * model), a form (which build of it), a colourway, a pose, an expression, an
 * outfit and a prop. None of them knows about the others, which is what keeps
 * the combinatorics free: twelve poses times six expressions times two dozen
 * accessories is not something anyone drew, it is something the assembly
 * produces.
 *
 * Four properties are load-bearing and worth stating plainly.
 *
 * **The picture never depends on the app's CSS.** Every fill, stroke and
 * coordinate is an SVG attribute. The only stylesheet involved is the small
 * one this component writes *inside* the SVG for the motion, so lifting the
 * rendered `outerHTML` out of the page gives a standalone `.svg` file that
 * needs no build step, and stripping the animation leaves the identical still
 * image an email or a rasteriser will see.
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
 *
 * **The feet are the anchor.** A resting character breathes, blinks and shifts
 * its weight; it does not float. Both resting loops are anchored at the
 * species' ground line and use only transforms that cannot move a sole, so the
 * figure grows and leans out of its own feet. The exceptions are declared
 * rather than accidental: a species whose rig says `hovers` floats because it
 * flies, and `jumping` translates because a jump is an arc — and even there
 * the frames that touch down put the soles exactly on the line. `walking` does
 * move its feet, but one at a time: the gait lifts the trailing leg while the
 * stance leg stays planted, so the figure is never off the ground as a whole.
 *
 * **Motion is on by default and belongs to the pose.** Round one shared one
 * near-invisible idle loop across every pose, which read as a glitch rather
 * than as a decision. Now a walk strolls towards you, a jumppa hop crouches,
 * pops and lands, thumbs tap on a controller, fingers move on a keyboard, and
 * a character at rest breathes in phrases with a real pause between them — and
 * `animated={false}` still gives the identical still image, standing on the
 * pose's own key frame, which is what an email and a rasteriser will see.
 */

import { useId, type CSSProperties, type ReactElement } from "react";

import { accessory, accessoryFits, accessoryVisible } from "./accessories";
import { motionClasses, motionCss, motionPlan, safeId, seedFrom } from "./animation";
import { defaultForm, rigOf, type ConceptId, type LimbPaint } from "./concept";
import { getConcept } from "./concepts";
import {
  detailForSize,
  showsProps,
  type DetailLevel,
  type MascotCrop,
} from "./detail";
import { Face, type FaceStyle } from "./face";
import { ArmLimb, Hand, Legs } from "./limbs";
import { LEGACY_BOWS, LegacyArm, LegacyLegs } from "./limbs-legacy";
import { anchorsFor, ROLE_OUTFITS, type Outfit, type OutfitSlot } from "./outfit";
import { MASCOT_INK, type ColorOverride, type Colorway } from "./palette";
import { POSES, propAnchor } from "./poses";
import { lookById, lookForDate } from "./seasons";
import { HeldProp } from "./props";
import {
  groundY,
  MASCOT_CENTRE_X,
  MASCOT_VIEWBOX,
  originOf,
  reachedHand,
} from "./rig";
import {
  POSE_LABELS,
  ROLE_DEFAULT_PROP,
  ROLE_LABELS,
  type ExpressionId,
  type GazeId,
  type MascotRole,
  type PoseId,
  type PropId,
} from "./vocabulary";

export type MascotProps = {
  /** Which base model. */
  concept: ConceptId;
  /** Which build of it — the species in an animal family, the age in a human one. */
  form?: string;
  /** Which of that concept's colourways. Falls back to its first. */
  variant?: string;
  pose?: PoseId;
  expression?: ExpressionId;
  /**
   * Where the character is looking, in the viewer's directions.
   *
   * Independent of the mood, static, and free: it moves a pupil and nothing
   * else, so it needs no animation and survives every crop and detail level.
   * It is the prop a product surface reaches for — a mascot beside a button
   * looks at the button — and it is worth stating that the expression's own
   * pupil position loses to it. Anything but `forward` overrides the mood's
   * gaze rather than adding to it; `forward` leaves the mood alone, which is
   * why Thinking still looks away by default.
   */
  gaze?: GazeId;
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
  /**
   * Idle and pose motion. Off gives the exact same picture, standing still on
   * the pose's own key frame.
   */
  animated?: boolean;
  /**
   * A seasonal or holiday look, layered under whatever the caller asks for
   * explicitly. `"auto"` means "dress for today", which is the whole point —
   * a product surface says that once and never thinks about the calendar
   * again.
   */
  look?: string;
  /**
   * The instant `look="auto"` resolves against. Pass a request-stable value on
   * any surface that server-renders, or a render straddling Helsinki midnight
   * will hydrate into a different outfit than it painted.
   */
  now?: Date;
  /** Which face design. Only the exploration page has any reason to pass this. */
  faceStyle?: FaceStyle;
  /**
   * Which limb renderer. `legacy` is round one's single bowed stroke, kept so
   * the arm rework can be shown next to what it replaced; it goes with the
   * exploration page.
   */
  limbStyle?: "current" | "legacy";
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
  // Wide enough that whatever a species carries above its head — antlers,
  // hare ears, a witch hat — is inside the frame. A portrait that crops the
  // one feature telling two species apart is a portrait of neither.
  const side = crop === "bust" ? headR * 3.6 : headR * 2.9;
  const cy = crop === "bust" ? headY + headR * 0.5 : headY + headR * 0.05;
  return `${headX - side / 2} ${cy - side / 2} ${side} ${side}`;
}

/** Slot draw order behind the body, and in front of it. */
const BEHIND_SLOTS: readonly OutfitSlot[] = ["back"];
const TORSO_SLOTS: readonly OutfitSlot[] = ["torso"];
const HEAD_SLOTS: readonly OutfitSlot[] = ["hat", "face"];
const GROUND_SLOTS: readonly OutfitSlot[] = ["extra"];

export function Mascot({
  concept,
  form,
  variant,
  pose = "idle",
  expression = "happy",
  gaze = "forward",
  role = "none",
  outfit,
  colors: colorOverride,
  prop,
  size = 160,
  detail,
  crop = "full",
  animated = true,
  look,
  now,
  faceStyle = "symbol",
  limbStyle = "current",
  silhouette = false,
  label,
  className,
}: MascotProps): ReactElement {
  const def = getConcept(concept);
  const uid = safeId(useId());
  const level = detail ?? detailForSize(size);

  const activeForm =
    form !== undefined && def.forms?.some((f) => f.id === form) === true ? form : defaultForm(def);
  const rig = rigOf(def, activeForm);

  // A look is the weakest layer: the season dresses the character, and any
  // outfit or colour the caller names overrides it.
  const dressed =
    look === undefined ? undefined : look === "auto" ? lookForDate(now ?? new Date()) : lookById(look);

  const chosen = def.variants.find((v) => v.id === variant) ?? def.variants[0];
  const palette: Colorway = { ...chosen.colors, ...dressed?.colors, ...colorOverride };
  const paint: LimbPaint = def.limbs(palette);
  const spec = POSES[pose];
  const anchors = anchorsFor(rig);
  // The pose table speaks in one canonical body's coordinates; a wide species
  // corrects them once, here, so that everything downstream — arms, hands and
  // whatever is held between them — agrees about where the hands ended up.
  const handL = reachedHand(rig, spec.handL);
  const handR = reachedHand(rig, spec.handR);

  // A silhouette is a shape test; motion on a flattened figure tells you
  // nothing and still costs a repaint per frame.
  const moving = animated && !silhouette;
  const plan = moving ? motionPlan(pose, expression, rig.hovers === true) : {};
  const cls = motionClasses(uid, plan);
  // Both resting loops turn about the line the soles rest on, which is what
  // makes them incapable of moving a foot: a scale anchored there pins y at
  // the ground, and a shear anchored there pins y everywhere. It is the
  // species' own line rather than the canvas's nominal baseline, because those
  // differ by up to three units and three units of drift is exactly the
  // "hovering" this replaced.
  const ground = originOf({ x: MASCOT_CENTRE_X, y: groundY(rig) });

  // A role dresses the character; an explicit outfit is layered over the top,
  // so a caller can put a party hat on a gedu without losing the lanyard.
  const worn: Outfit = { ...ROLE_OUTFITS[role], ...dressed?.outfit, ...outfit };

  // The pose picks the prop when it implies one (a reading pose needs a book);
  // otherwise the role fills an idle hand, but only when that hand is free.
  const roleProp = spec.freeHand ? ROLE_DEFAULT_PROP[role] : "none";
  const heldProp = prop ?? (spec.defaultProp === "none" ? roleProp : spec.defaultProp);

  // Whether this pose is one the character is *resting* in, decided from where
  // the pose puts the hands rather than from a list of pose ids: both hands
  // down at the hip line and inside the body's own width is a stand, and
  // anything reaching, pointing, waving or jumping is not. Kept here rather
  // than in the pose table because it is a question only a species with
  // `armsOnDemand` ever asks, and because deriving it means a pose added later
  // answers it without anybody editing this file.
  const resting = [handL, handR].every(
    (h) => h.y >= rig.hip.y - 8 && Math.abs(h.x - MASCOT_CENTRE_X) <= 50,
  );
  // A held object needs a hand whatever the hands' coordinates say — a seated
  // pose puts them on a desk, which is at the hip line and is not a rest.
  const showsArms = rig.armsOnDemand !== true || !resting || heldProp !== "none";

  const parts = {
    rig,
    colors: palette,
    variantId: chosen.id,
    form: activeForm,
    expression,
    detail: level,
    floatClass: cls.float ?? "",
  };

  const sceneItem = (() => {
    const id = worn.scene;
    if (id === undefined) return undefined;
    const item = accessory(id);
    if (item === undefined) return undefined;
    if (!accessoryFits(item, def.id) || !accessoryVisible(item, level)) return undefined;
    return item;
  })();
  const ctx = { anchors, rig, colors: palette, detail: level };

  const drawSlots = (slots: readonly OutfitSlot[]): ReactElement[] =>
    slots.flatMap((slot) => {
      const id = worn[slot];
      if (id === undefined) return [];
      const item = accessory(id);
      if (item === undefined) return [];
      if (!accessoryFits(item, def.id) || !accessoryVisible(item, level)) return [];
      return [<g key={slot}>{item.render(ctx)}</g>];
    });

  const described =
    label ??
    `${def.species} mascot, ${chosen.label} colourway${role === "none" ? "" : `, dressed as a ${ROLE_LABELS[role].toLowerCase()}`}, ${POSE_LABELS[pose].toLowerCase()}`;

  const flatten: CSSProperties | undefined = silhouette
    ? { filter: "brightness(0)" }
    : undefined;

  const armGroup = (side: "armL" | "armR", shoulder: { x: number; y: number }, children: ReactElement) =>
    cls[side] === undefined ? (
      children
    ) : (
      <g className={cls[side]} style={{ transformOrigin: originOf(shoulder) }}>
        {children}
      </g>
    );

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
      {moving && <style>{motionCss(uid, seedFrom(uid), plan)}</style>}
      {!silhouette && sceneItem === undefined && (
        <ellipse
          cx={rig.shadow.cx}
          cy={rig.shadow.cy}
          rx={rig.shadow.rx}
          ry={rig.shadow.ry}
          fill={MASCOT_INK.shadow}
          opacity={0.45}
        />
      )}
      {/* Furniture is drawn outside every motion group. A desk that breathed
          with the person sitting at it would be a very strange desk. */}
      {sceneItem?.renderBehind !== undefined && <g style={flatten}>{sceneItem.renderBehind(ctx)}</g>}
      <g className={cls.body} style={{ ...flatten, transformOrigin: ground }}>
        <g className={cls.breathe} style={{ transformOrigin: ground }}>
          <g transform={spec.lift === 0 ? undefined : `translate(0 ${-spec.lift})`}>
            {drawSlots(BEHIND_SLOTS)}
            {limbStyle === "legacy" ? (
              <LegacyLegs rig={rig} paint={paint} legs={spec.legs} />
            ) : (
              <Legs rig={rig} paint={paint} legs={spec.legs} classL={cls.legL} classR={cls.legR} />
            )}
            <def.Body {...parts} />
            {drawSlots(TORSO_SLOTS)}
            <g
              className={rig.fusedHead ? undefined : cls.head}
              style={
                rig.fusedHead
                  ? undefined
                  : { transformOrigin: originOf({ x: rig.head.x, y: rig.head.y + rig.head.r * 0.9 }) }
              }
            >
              <def.Head {...parts} />
              {def.Crown !== undefined && <def.Crown {...parts} />}
              <Face
                rig={rig}
                colors={palette}
                expression={expression}
                mode={def.faceMode}
                detail={level}
                style={faceStyle}
                gaze={gaze}
                blinkClass={cls.blink ?? ""}
              />
              {drawSlots(HEAD_SLOTS)}
            </g>
            {showsArms &&
              armGroup(
                "armL",
                rig.shoulderL,
                limbStyle === "legacy" ? (
                  <LegacyArm rig={rig} paint={paint} from={rig.shoulderL} to={handL} bow={LEGACY_BOWS[pose].l} />
                ) : (
                  <ArmLimb rig={rig} paint={paint} from={rig.shoulderL} to={handL} />
                ),
              )}
            {showsArms &&
              armGroup(
                "armR",
                rig.shoulderR,
                limbStyle === "legacy" ? (
                  <LegacyArm rig={rig} paint={paint} from={rig.shoulderR} to={handR} bow={LEGACY_BOWS[pose].r} />
                ) : (
                  <ArmLimb rig={rig} paint={paint} from={rig.shoulderR} to={handR} />
                ),
              )}
            {showsProps(level) && (
              <g className={cls.prop} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
                <HeldProp prop={heldProp} at={propAnchor(spec.grip, handL, handR)} colors={palette} />
              </g>
            )}
            {/* The hands repeat their arm's class rather than living inside the
                arm group, so that a held object still sits between the arm and
                the hand that is gripping it. Same keyframes and same delay, so
                they move as one. */}
            {showsArms && armGroup("armL", rig.shoulderL, <Hand rig={rig} paint={paint} at={handL} />)}
            {showsArms && armGroup("armR", rig.shoulderR, <Hand rig={rig} paint={paint} at={handR} />)}
            {drawSlots(GROUND_SLOTS)}
          </g>
        </g>
      </g>
      {sceneItem !== undefined && <g style={flatten}>{sceneItem.render(ctx)}</g>}
    </svg>
  );
}
