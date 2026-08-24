/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

/**
 * The walk-in — a spike, not a system.
 *
 * Kyle asked whether a mascot could walk in from off screen in side profile
 * and then turn to face you, and said he did not want to rule it out without
 * putting a little effort into seeing what it could become. This file is that
 * effort and nothing more: **a deliberate, clearly-labelled fork of the rig**,
 * which either gets deleted or gets promoted into a real profile axis on the
 * concept model, and is never maintained in between. Nothing else in the
 * module imports it, and nothing here should be copied out of it.
 *
 * ## What is forked and why
 *
 * The rig, the pose table and every concept in `concepts/` draw one view:
 * front-facing, centred on x 100 of a 200-unit box. A profile is a *second
 * drawing of every species* — that is the honest cost and it does not go away.
 * So rather than pretend otherwise, the two profiles below are hand-drawn
 * locally, in the same 200-box coordinates the real rig uses, off the same
 * measured numbers the concepts carry (Silmu's bean is 121 tall with its
 * widest point at 54% of that; Otso's cub is a 36 × 30 body under a 40-radius
 * head with 15-radius ear discs). They reuse the concepts' **palettes** — the
 * one thing that must not fork, because a profile in a different honey than
 * the front view is two characters.
 *
 * The front half of the turn is the **real `<Mascot>`**, not a redraw. That is
 * the load-bearing part of the experiment: if the profile can hand off to the
 * live component cleanly, a profile axis is a drawing problem; if it cannot,
 * it is an architecture problem and the answer is no.
 *
 * ## How the turn is done
 *
 * The 2D way, which is the only way that does not need a third drawing: the
 * profile squashes in x toward the figure's own centre line until it is 8% of
 * its width, the two figures swap at the narrowest instant on a `step-end`
 * opacity (a crossfade at that moment reads as a dissolve, which is a
 * different and much worse effect), and the front figure expands out of the
 * same sliver with a small overshoot. A hair of y-stretch during the squash
 * sells it as a body turning rather than a picture being scaled.
 *
 * ## Structure, and why it is nested the way it is
 *
 * Two nested `<svg>` viewports sit inside one 600 × 200 stage, both at x 200,
 * both 200 × 200 with their own `0 0 200 200` viewBox. That is not decoration:
 * `transform-origin` on an SVG element resolves against the *nearest viewport*,
 * so putting each figure in its own 200-box viewport means every origin in
 * this file — hips, ankles, the turn's axis — is written in the same
 * coordinates the rig uses, with no static `transform` attribute anywhere
 * between the animated element and its viewport to bend them.
 *
 * The stylesheet lives inside the stage SVG, like the rest of the module's
 * motion, and the DOM is ordered so that **stripping it leaves the front-facing
 * figure standing at its arrival mark**: the travelling wrapper has no
 * transform of its own, the profile carries `opacity="0"` as an attribute, and
 * the front figure carries none. Each character gets a third tile rendered with
 * the stylesheet withheld, so the rule is looked at on the page rather than
 * asserted in a comment.
 *
 * No `prefers-reduced-motion` gate — standing ruling for this module.
 */

import { useId, useState, type ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { Mascot } from "../mascot";
import {
  MASCOT_INK,
  MASCOT_SCENERY,
  OTSO_VARIANTS,
  shadeHex,
  SILMU_VARIANTS,
  type Colorway,
} from "../palette";
import { Rubric } from "./controls";

// --- the timeline ---------------------------------------------------------

/** Seconds for one full stride — two steps. */
const STRIDE = 0.52;
/** Strides in each travelling leg of the story. */
const CYCLES = 6;
/** How long the figure spends walking, each way. */
const RUN = STRIDE * CYCLES;
/** How far it travels in that time, in stage units. Speed is RUN / TRAVEL. */
const TRAVEL = 460;
/** Samples per stride in the generated gait. Eight is where the sine stops looking polygonal. */
const SAMPLES = 8;

/**
 * The beats, in seconds from the start of the loop.
 *
 * The walk-out exists to make the loop seamless rather than because the story
 * needs it: at `end` the figure is past the right edge of the stage and the
 * wrap back to `-TRAVEL` happens entirely off screen, so there is no fade, no
 * cut and no reset to look at. The play-once version stops at `standEnd`.
 */
const T = {
  /** Arrival: the last step of the walk-in lands. */
  arrive: RUN,
  /** The trailing leg comes up alongside and the weight settles. */
  settled: RUN + 0.6,
  /** The narrowest instant — the profile and the front figure swap here. */
  swap: RUN + 1.0,
  /** The front figure has finished expanding out of the sliver. */
  popped: RUN + 1.4,
  /** End of the greeting. */
  standEnd: RUN + 3.5,
  /** The turn, run backwards. */
  swapBack: RUN + 3.85,
  popBack: RUN + 4.2,
  end: RUN + 4.2 + RUN,
} as const;

// --- what a profile is ----------------------------------------------------

/** The animated groups. Arms are optional: Silmu has none at rest. */
type Cls = {
  travel: string;
  profile: string;
  squash: string;
  bob: string;
  legNear: string;
  legFar: string;
  footNear: string;
  footFar: string;
  armNear?: string;
  armFar?: string;
  frontFade: string;
  frontPop: string;
};

type ProfileSpec = {
  id: string;
  title: string;
  note: string;
  colors: Colorway;
  /** The y the soles rest on, in the figure's own 200-box — the rig's `groundY`. */
  ground: number;
  /** The rig's own ground shadow, so the swap does not resize it. */
  shadow: { cx: number; rx: number; ry: number };
  /** Hip to sole: what the body has to drop by when a rigid leg swings out. */
  legLen: number;
  /** Peak leg swing either side of vertical, in degrees. */
  swing: number;
  /** How far the swinging foot is picked up so it clears the ground, in units. */
  lift: number;
  /** Peak arm swing, or 0 for a species that walks with none. */
  armSwing: number;
  /** The profile drawing. */
  art: (colors: Colorway, cls: Cls) => ReactElement;
  /** The front half of the turn — the real component, same colourway and hat. */
  front: () => ReactElement;
};

// --- Silmu, in profile ----------------------------------------------------

/**
 * The bean, turned side on.
 *
 * The front concept's bean is 120 wide and 121 tall (x 40–160, y 26–147) with
 * its widest point at 54% of the height. This is the same height and the same
 * two blunt flats — 20 across the top, 26 across the bottom — at 94 wide, which
 * is the "slightly narrower" a bean gets when you walk round it. It is centred
 * on x 100 rather than on its own visual centre, because that is the axis the
 * front figure expands out of and a shared axis is what makes the swap
 * invisible.
 */
const SILMU_BEAN = [
  "M 89 26",
  "L 109 26",
  "C 129 26.5 144 42 146 63",
  "C 146.8 72 147 82 147 91",
  "C 147 107 145 123 140 132",
  "C 135 141.5 125 147 113 147",
  "L 87 147",
  "C 75 147 65 141.5 60 132",
  "C 55 123 53 107 53 91",
  "C 53 82 53.6 72 55 63",
  "C 58 42 71 26.5 89 26",
  "Z",
].join(" ");

/** The underside plane, retracing the bean's own bottom edge exactly. */
const SILMU_UNDER = [
  "M 53.2 96",
  "C 54 110 56 124 60 132",
  "C 65 141.5 75 147 87 147",
  "L 113 147",
  "C 125 147 135 141.5 140 132",
  "C 144 124 146 110 146.8 96",
  "C 144 122 125 141 100 141",
  "C 75 141 56 122 53.2 96",
  "Z",
].join(" ");

/**
 * The swept cap from the side: a dome over the top of the bean and a peak
 * trailing behind it. Same grammar as the registry's front view — the top edge
 * of the peak is concave so it reads as blown back, and it ends in a point
 * rather than a rounded tip — which is the whole reason that hat is
 * recognisable at all.
 */
const SILMU_CAP_DOME = "M 57 42 C 55 16 75 2 101 4 C 127 6 143 22 143 42 Z";
const SILMU_CAP_PEAK = "M 63 30 C 45 34 31 46 17 36 C 29 50 47 56 65 47 Z";

const SILMU_HIP = 138;
const SILMU_SOLE = 183.5;
const SILMU_ANKLE = 176;

/**
 * One stem leg with a side-view 'd' foot.
 *
 * The foot gets its own counter-rotating group. A rigid stem swinging 26° puts
 * the toe 20 units into the floor at contact if the foot rides along with it,
 * which reads as a limp; cancelling the leg's rotation at the ankle keeps the
 * sole flat and turns contact into a heel strike, which is what a walk looks
 * like. It is two extra keyframe channels and it is the single change that
 * made this cycle read as walking.
 */
function silmuLeg(x: number, fill: string, legCls: string, footCls: string): ReactElement {
  return (
    <g className={legCls} style={{ transformOrigin: `${x}px ${SILMU_HIP}px` }}>
      <rect x={x - 7} y={SILMU_HIP} width={14} height={41} rx={7} fill={fill} />
      <g className={footCls} style={{ transformOrigin: `${x}px ${SILMU_ANKLE}px` }}>
        <path
          d={[
            `M ${x - 7} 169`,
            `L ${x + 2} 169`,
            `C ${x + 15} 169 ${x + 21} 175 ${x + 21} ${SILMU_SOLE - 4}`,
            `C ${x + 21} ${SILMU_SOLE - 1} ${x + 18} ${SILMU_SOLE} ${x + 13} ${SILMU_SOLE}`,
            `L ${x - 7} ${SILMU_SOLE}`,
            "Z",
          ].join(" ")}
          fill={fill}
        />
      </g>
    </g>
  );
}

function silmuArt(colors: Colorway, cls: Cls): ReactElement {
  // A profile needs more tonal separation between its limbs than a front view
  // does. Front-on, the trailing leg stands *beside* the leading one against
  // the page; side-on it stands *behind* it, and two legs the same colour at
  // the passing pose are one wide leg.
  const far = shadeHex(colors.limb, 0.45);
  return (
    <g>
      {silmuLeg(92, far, cls.legFar, cls.footFar)}
      {silmuLeg(106, colors.limb, cls.legNear, cls.footNear)}
      {/* `musta` is #22222A on a #121212 page and has no edge without this.
          The front concept decides it by luminance; here the colourway is
          fixed, so the spec says so instead. */}
      <path
        d={SILMU_BEAN}
        fill="none"
        stroke={colors.spark}
        strokeWidth={3.4}
        strokeLinejoin="round"
      />
      <path d={SILMU_BEAN} fill={colors.bodyTop} />
      <path d={SILMU_UNDER} fill={colors.bodyBottom} opacity={0.9} />
      <g fill={colors.clothing}>
        <path d={SILMU_CAP_PEAK} />
        <path d={SILMU_CAP_DOME} />
      </g>
      {/* The one eye, pushed toward the leading edge and narrowed: a 21-radius
          disc seen from the side is an ellipse, and the pupil goes forward of
          its centre because that is where a thing looking where it is going
          puts it. No brow, ever — the species has none. */}
      <ellipse cx={117} cy={72} rx={16.5} ry={20} fill={colors.sclera} />
      <circle cx={124} cy={72} r={7} fill={colors.pupil} />
    </g>
  );
}

// --- Otso, in profile -----------------------------------------------------

const OTSO_HIP = 150;
const OTSO_SOLE = 186.7;
const OTSO_ANKLE = 178;
const OTSO_SHOULDER = 114;

function otsoLeg(x: number, fill: string, legCls: string, footCls: string): ReactElement {
  return (
    <g className={legCls} style={{ transformOrigin: `${x}px ${OTSO_HIP}px` }}>
      <rect x={x - 6.5} y={OTSO_HIP} width={13} height={30} rx={6.5} fill={fill} />
      <g className={footCls} style={{ transformOrigin: `${x}px ${OTSO_ANKLE}px` }}>
        <ellipse cx={x + 4} cy={OTSO_SOLE - 6.2} rx={12} ry={6.2} fill={fill} />
      </g>
    </g>
  );
}

function otsoArm(x: number, fill: string, cls: string | undefined): ReactElement {
  return (
    <g className={cls ?? ""} style={{ transformOrigin: `${x}px ${OTSO_SHOULDER}px` }}>
      {/* Long enough that the paw hangs clear of the belly. An arm that ends
          inside the body silhouette reads as a strap painted on it, whichever
          shade it is drawn in — the swinging paw below the coat is the part
          that says "arm". */}
      <rect x={x - 5.5} y={OTSO_SHOULDER} width={11} height={46} rx={5.5} fill={fill} />
      <circle cx={x} cy={OTSO_SHOULDER + 52} r={9} fill={fill} />
    </g>
  );
}

/**
 * The cub, turned side on, and still bipedal.
 *
 * A quadruped profile would be a better bear and a worse experiment: the front
 * view it turns into stands on two legs, so a four-legged walk-in would swap
 * one animal for another at the narrowest instant. The parts that only a
 * profile has are the muzzle actually protruding (front-on it is a flat disc
 * on the face), one ear in front and one behind in the darker plane, and the
 * tail moving to the trailing side.
 */
function otsoArt(colors: Colorway, cls: Cls): ReactElement {
  // Two shades of the one limb colour, for the same reason Silmu needs them:
  // side-on, a limb crosses its own body instead of standing beside it. The
  // near *arm* takes a shade of its own on top of that, because it is the only
  // limb here drawn over the belly rather than hanging below it — at the front
  // view's `limb` it is a four-per-cent difference against the coat and simply
  // is not there.
  const far = shadeHex(colors.limb, 0.4);
  const nearArm = shadeHex(colors.limb, 0.18);
  return (
    <g>
      <circle cx={53} cy={142} r={9} fill={colors.bodyBottom} />
      <circle cx={78} cy={44} r={12} fill={colors.bodyBottom} />
      {otsoArm(84, far, cls.armFar)}
      {otsoLeg(80, far, cls.legFar, cls.footFar)}
      {/* Both legs go behind the body, so the hip join is covered and the
          belly plane stays one clean shape. */}
      {otsoLeg(94, colors.limb, cls.legNear, cls.footNear)}
      <ellipse cx={88} cy={132} rx={33} ry={30} fill={colors.bodyTop} />
      <ellipse cx={101} cy={139} rx={19} ry={18} fill={colors.panel} />
      <circle cx={90} cy={36} r={14} fill={colors.bodyTop} />
      <circle cx={91} cy={37} r={7} fill={colors.panel} />
      <circle cx={104} cy={70} r={37} fill={colors.bodyTop} />
      <ellipse cx={138} cy={82} rx={17} ry={13} fill={colors.panel} />
      <ellipse cx={150} cy={77} rx={7} ry={6} fill={MASCOT_INK.line} />
      <path
        d="M 133 93 Q 139 98 145 92"
        fill="none"
        stroke={MASCOT_INK.line}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <ellipse cx={122} cy={62} rx={7} ry={8} fill={colors.sclera} />
      <circle cx={124} cy={62} r={4} fill={colors.pupil} />
      {otsoArm(104, nearArm, cls.armNear)}
    </g>
  );
}

// --- the two characters ---------------------------------------------------

const SILMU_MUSTA =
  SILMU_VARIANTS.find((v) => v.id === "musta")?.colors ?? SILMU_VARIANTS[0].colors;
const OTSO_HONEY =
  OTSO_VARIANTS.find((v) => v.id === "honey")?.colors ?? OTSO_VARIANTS[0].colors;

const SPECS: readonly ProfileSpec[] = [
  {
    id: "silmu",
    title: "Silmu — musta, swept cap",
    note: "Stem legs and 'd' feet, the one eye near the leading edge, the cap trailing behind.",
    colors: SILMU_MUSTA,
    ground: SILMU_SOLE,
    shadow: { cx: 100, rx: 46, ry: 7 },
    legLen: SILMU_SOLE - SILMU_HIP,
    swing: 25.8,
    lift: 3.5,
    armSwing: 0,
    art: silmuArt,
    front: () => (
      <Mascot
        concept="silmu"
        variant="musta"
        pose="wave"
        expression="excited"
        outfit={{ hat: "swept-cap" }}
        size={200}
        animated
        label="Silmu, arrived and waving"
      />
    ),
  },
  {
    id: "otso",
    title: "Otso — honey cub",
    note: "Bipedal, so the turn lands on the same animal. Muzzle out, one ear behind, tail trailing.",
    colors: OTSO_HONEY,
    ground: OTSO_SOLE,
    shadow: { cx: 100, rx: 42, ry: 7 },
    legLen: OTSO_SOLE - OTSO_HIP,
    swing: 31.5,
    lift: 3.2,
    armSwing: 17,
    art: otsoArt,
    front: () => (
      <Mascot
        concept="otso"
        form="bear"
        variant="honey"
        pose="wave"
        expression="happy"
        size={200}
        animated
        label="Otso, arrived and waving"
      />
    ),
  },
];

// --- the stylesheet -------------------------------------------------------

type Pair = [number, string];

/** Two decimals is finer than a pixel at any size this renders at. */
const num = (v: number): string => v.toFixed(2);

/**
 * Builds one scene's stylesheet.
 *
 * The gait is *generated* rather than hand-written, because it has to stay in
 * step with the travel: the wrapper translates linearly, so the only thing
 * keeping the feet from skating is that a stride covers exactly
 * `TRAVEL / CYCLES` units. Change the speed or the cadence and the samples
 * follow; hand-typed keyframes would not.
 */
function buildScene(uid: string, spec: ProfileSpec, exit: boolean): { css: string; cls: Cls } {
  const total = exit ? T.end : T.standEnd;
  const at = (t: number): string => `${((t / total) * 100).toFixed(3)}%`;
  const rules: string[] = [];
  const channel = (name: string, frames: string, ease: string): string => {
    const key = `${name}-${uid}`;
    rules.push(`@keyframes k${key}{${frames}}`);
    rules.push(
      `.c${key}{animation:k${key} ${total.toFixed(3)}s ${ease} ${exit ? "infinite" : "1 both"}}`,
    );
    return `c${key}`;
  };

  // --- travel: constant speed in, constant speed out, still in between ----
  const travel = exit
    ? `0%{transform:translateX(${-TRAVEL}px)}${at(T.arrive)}{transform:translateX(0)}${at(
        T.popBack,
      )}{transform:translateX(0)}100%{transform:translateX(${TRAVEL}px)}`
    : `0%{transform:translateX(${-TRAVEL}px)}${at(T.arrive)}{transform:translateX(0)}100%{transform:translateX(0)}`;

  // --- the swap: a hard cut at the narrowest instant, never a crossfade ---
  const profileFade = exit
    ? `0%{opacity:1}${at(T.swap)}{opacity:0}${at(T.swapBack)}{opacity:1}100%{opacity:1}`
    : `0%{opacity:1}${at(T.swap)}{opacity:0}100%{opacity:0}`;
  const frontFade = exit
    ? `0%{opacity:0}${at(T.swap)}{opacity:1}${at(T.swapBack)}{opacity:0}100%{opacity:0}`
    : `0%{opacity:0}${at(T.swap)}{opacity:1}100%{opacity:1}`;

  // --- the turn itself ----------------------------------------------------
  const flat = "transform:scale(0.08,1.06)";
  const squash = exit
    ? `0%{transform:scale(1,1)}${at(T.settled)}{transform:scale(1,1);animation-timing-function:ease-in}${at(
        T.swap,
      )}{${flat}}${at(T.swapBack)}{${flat};animation-timing-function:ease-out}${at(
        T.popBack,
      )}{transform:scale(1,1)}100%{transform:scale(1,1)}`
    : `0%{transform:scale(1,1)}${at(T.settled)}{transform:scale(1,1);animation-timing-function:ease-in}${at(
        T.swap,
      )}{${flat}}100%{${flat}}`;
  const pop = exit
    ? `0%{${flat}}${at(T.swap)}{${flat};animation-timing-function:ease-out}${at(
        T.swap + 0.24,
      )}{transform:scale(1.09,0.97)}${at(T.popped)}{transform:scale(1,1)}${at(
        T.standEnd,
      )}{transform:scale(1,1);animation-timing-function:ease-in}${at(T.swapBack)}{${flat}}100%{${flat}}`
    : `0%{${flat}}${at(T.swap)}{${flat};animation-timing-function:ease-out}${at(
        T.swap + 0.24,
      )}{transform:scale(1.09,0.97)}${at(T.popped)}{transform:scale(1,1)}100%{transform:scale(1,1)}`;

  // --- the gait -----------------------------------------------------------
  const legNear: Pair[] = [];
  const legFar: Pair[] = [];
  const footNear: Pair[] = [];
  const footFar: Pair[] = [];
  const armNear: Pair[] = [];
  const armFar: Pair[] = [];
  const bob: Pair[] = [];

  // The walk-out starts on the passing pose (phase 0.25 — both legs vertical)
  // rather than on a contact, so the profile can expand out of its sliver
  // already standing neutral and step off from there instead of snapping into
  // a stride the instant it becomes visible.
  const windows = exit
    ? [
        { start: 0, phase0: 0 },
        { start: T.popBack, phase0: 0.25 },
      ]
    : [{ start: 0, phase0: 0 }];

  for (const w of windows) {
    for (let i = 0; i <= CYCLES * SAMPLES; i += 1) {
      const t = w.start + (i * STRIDE) / SAMPLES;
      const phi = (w.phase0 + i / SAMPLES) % 1;
      const c = Math.cos(2 * Math.PI * phi);
      const s = Math.sin(2 * Math.PI * phi);
      // Forward is -x-ward rotation: SVG's positive angle is clockwise, and a
      // foot hanging below the hip swings backwards under it.
      const near = -spec.swing * c;
      const farAngle = spec.swing * c;
      const liftNear = -spec.lift * Math.max(0, -s);
      const liftFar = -spec.lift * Math.max(0, s);
      // The stance leg is a rigid stem, so swinging it out lifts its own foot
      // off the floor; the body drops by exactly that much instead, which is
      // what keeps the sole on the ground line through the whole cycle. It is
      // also, conveniently, a real walk's vertical bob.
      const drop = spec.legLen * (1 - Math.cos((spec.swing * Math.abs(c) * Math.PI) / 180));
      legNear.push([t, `transform:translateY(${num(liftNear)}px) rotate(${num(near)}deg)`]);
      legFar.push([t, `transform:translateY(${num(liftFar)}px) rotate(${num(farAngle)}deg)`]);
      footNear.push([t, `transform:rotate(${num(-near)}deg)`]);
      footFar.push([t, `transform:rotate(${num(-farAngle)}deg)`]);
      armNear.push([t, `transform:rotate(${num(spec.armSwing * c)}deg)`]);
      armFar.push([t, `transform:rotate(${num(-spec.armSwing * c)}deg)`]);
      bob.push([t, `transform:translateY(${num(drop)}px)`]);
    }
  }

  // The settle: the trailing leg comes up alongside, the weight drops a shade
  // past level and comes back. Then everything holds neutral until the turn
  // has run backwards and the figure is ready to step off again.
  const still = [T.arrive + 0.3, T.settled, ...(exit ? [T.swapBack] : [total])];
  for (const t of still) {
    const sink = t === T.arrive + 0.3 ? 2.4 : 0;
    legNear.push([t, "transform:translateY(0) rotate(0deg)"]);
    legFar.push([t, "transform:translateY(0) rotate(0deg)"]);
    footNear.push([t, "transform:rotate(0deg)"]);
    footFar.push([t, "transform:rotate(0deg)"]);
    armNear.push([t, "transform:rotate(0deg)"]);
    armFar.push([t, "transform:rotate(0deg)"]);
    bob.push([t, `transform:translateY(${num(sink)}px)`]);
  }

  const framesOf = (pairs: readonly Pair[]): string =>
    [...pairs]
      .sort((a, b) => a[0] - b[0])
      .map(([t, v]) => `${at(t)}{${v}}`)
      .join("");

  const cls: Cls = {
    travel: channel("tr", travel, "linear"),
    profile: channel("pf", profileFade, "step-end"),
    squash: channel("sq", squash, "linear"),
    bob: channel("bo", framesOf(bob), "linear"),
    legNear: channel("ln", framesOf(legNear), "linear"),
    legFar: channel("lf", framesOf(legFar), "linear"),
    footNear: channel("fn", framesOf(footNear), "linear"),
    footFar: channel("ff", framesOf(footFar), "linear"),
    frontFade: channel("hf", frontFade, "step-end"),
    frontPop: channel("hp", pop, "linear"),
    ...(spec.armSwing > 0
      ? {
          armNear: channel("an", framesOf(armNear), "linear"),
          armFar: channel("af", framesOf(armFar), "linear"),
        }
      : {}),
  };

  return { css: rules.join(""), cls };
}

// --- the stage ------------------------------------------------------------

/** Classes with nothing attached, for the stripped tile. */
const NO_CLS: Cls = {
  travel: "",
  profile: "",
  squash: "",
  bob: "",
  legNear: "",
  legFar: "",
  footNear: "",
  footFar: "",
  frontFade: "",
  frontPop: "",
};

function WalkInStage({
  spec,
  exit,
  stripped = false,
}: {
  spec: ProfileSpec;
  exit: boolean;
  stripped?: boolean;
}): ReactElement {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const built = buildScene(uid, spec, exit);
  const cls = stripped ? NO_CLS : built.cls;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 600 200"
      className="block h-auto w-full"
      role="img"
      aria-label={`${spec.title}: walks in from the left in profile, arrives and turns to face you`}
    >
      {!stripped && <style>{built.css}</style>}
      <line
        x1={0}
        y1={spec.ground}
        x2={600}
        y2={spec.ground}
        stroke={MASCOT_SCENERY.stone}
        strokeWidth={1.5}
        opacity={0.3}
      />
      <g className={cls.travel}>
        <svg
          x={200}
          y={0}
          width={200}
          height={200}
          viewBox="0 0 200 200"
          overflow="visible"
          style={{ overflow: "visible" }}
        >
          {/* opacity as an *attribute*, so the profile is the half that
              disappears when the stylesheet goes. */}
          <g className={cls.profile} opacity={0}>
            {/* Outside the squash: the ground shadow does not turn with the
                body, and it is the rig's own ellipse so the swap does not
                resize it. */}
            <ellipse
              cx={spec.shadow.cx}
              cy={186}
              rx={spec.shadow.rx}
              ry={spec.shadow.ry}
              fill={MASCOT_INK.shadow}
              opacity={0.45}
            />
            <g className={cls.squash} style={{ transformOrigin: `100px ${spec.ground}px` }}>
              <g className={cls.bob}>{spec.art(spec.colors, cls)}</g>
            </g>
          </g>
        </svg>
        <svg
          x={200}
          y={0}
          width={200}
          height={200}
          viewBox="0 0 200 200"
          overflow="visible"
          style={{ overflow: "visible" }}
        >
          <g className={cls.frontFade}>
            <g className={cls.frontPop} style={{ transformOrigin: `100px ${spec.ground}px` }}>
              {spec.front()}
            </g>
          </g>
        </svg>
      </g>
    </svg>
  );
}

function Frame({ caption, children }: { caption: string; children: ReactElement }): ReactElement {
  return (
    <figure className="space-y-1.5">
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        {children}
      </div>
      <figcaption className="text-[11px] leading-tight text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

export function WalkInSpike(): ReactElement {
  const [take, setTake] = useState(0);
  return (
    <Card>
      <CardContent className="space-y-8 p-5">
        <div className="space-y-2">
          <Rubric
            title="Spike — walk in, then turn"
            note="A fork, not a system. Profiles are hand-drawn here; the front half is the real component."
          />
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
            The figure walks in from off stage in side profile, arrives, settles, and turns to face
            you: the profile squashes to a sliver about its own centre line, the two drawings swap
            on a hard cut at the narrowest instant, and the front-facing mascot expands out of the
            same sliver and waves. The looping take runs the turn backwards at the end and walks out
            of frame, so the loop resets off screen with nothing to see.
          </p>
        </div>

        {SPECS.map((spec) => (
          <section key={spec.id} className="space-y-4">
            <Rubric title={spec.title} note={spec.note} />
            <Frame caption="Looping — walk in, turn, greet, turn back, walk out.">
              <WalkInStage spec={spec} exit />
            </Frame>
            <Frame caption="The moment — plays once and holds on the arrival.">
              <WalkInStage key={`${spec.id}-${take}`} spec={spec} exit={false} />
            </Frame>
            <Frame caption="Stylesheet stripped — the front figure standing at its arrival mark, which is what an email or a rasterised image gets.">
              <WalkInStage spec={spec} exit={false} stripped />
            </Frame>
          </section>
        ))}

        <button
          type="button"
          onClick={() => {
            setTake((n) => n + 1);
          }}
          className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Replay the moment
        </button>
      </CardContent>
    </Card>
  );
}
