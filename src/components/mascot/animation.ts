/**
 * Motion — the animation system, as a stylesheet that lives *inside* the SVG.
 *
 * Two things follow from putting it there rather than in `globals.css` or a
 * CSS module. First, the drawing stays self-contained: lifting the rendered
 * `outerHTML` out of the page gives a standalone `.svg` file that still moves,
 * with no build step and nothing to re-link. Second, the *shape* never depends
 * on the app's CSS — every fill, stroke and coordinate is an attribute, and
 * this stylesheet only ever adds motion on top. Strip it and you have the
 * exact same picture, standing still on the pose's own key frame, which is
 * what an email client and a rasterised marketing image will each see.
 *
 * ## Round two committed to the motion
 *
 * Round one hedged: a two-and-a-half pixel rise, a two percent breath, a
 * degree and a half of tilt. The verdict was that it read as a mistake rather
 * than as a decision — motion too small to be intentional is worse than none,
 * because the viewer notices something moved and cannot tell what. So the
 * amplitudes here are deliberately legible, and every pose carries its own
 * motion instead of every pose sharing one idle loop: **walking walks**, a
 * jump has anticipation, squash and a landing, typing fingers move, a page
 * gets turned, a laptop screen pulses.
 *
 * There is no `prefers-reduced-motion` gate, by explicit product decision.
 *
 * ## One economy, kept because it costs nothing
 *
 * A pose only emits the channels it actually moves. An idle character runs
 * five animations; one seated at a desk runs four; a silhouette runs none. The
 * stylesheet is generated from the plan rather than from a fixed list, so
 * nothing pays for a channel it does not use, and reading the emitted CSS
 * tells you exactly what a given pose is doing.
 */

import type { ExpressionId, PoseId } from "./vocabulary";

/**
 * What can move. Each channel is one group in the drawing and gets at most one
 * animation, so the class name can simply be the channel.
 */
export const MOTION_CHANNELS = [
  /** The whole figure: bob, bounce, walk lift, the jump arc. */
  "body",
  /** The chest, scaled about the baseline. */
  "breathe",
  /** The head group — tilt, look-around, nod. */
  "head",
  /** The eyes only. */
  "blink",
  /** A floating crown item, where a species has one. */
  "float",
  /** Each arm, rotated about its own shoulder. Hands ride along. */
  "armL",
  "armR",
  /** Each leg, rotated about its own hip. */
  "legL",
  "legR",
  /** Whatever is being held. */
  "prop",
] as const;
export type MotionChannel = (typeof MOTION_CHANNELS)[number];

type Keyframe = {
  /** The body of the `@keyframes` rule. */
  frames: string;
  /** Seconds. */
  dur: number;
  ease: string;
};

/**
 * The keyframe library. Ids are short because they end up in the markup once
 * per instance; the names are only ever seen by this module.
 */
const KEYFRAMES = {
  // --- whole-body ---------------------------------------------------------
  bob: {
    frames: "0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}",
    dur: 2.8,
    ease: "ease-in-out",
  },
  bounce: {
    frames:
      "0%,100%{transform:translateY(0) scale(1,1)}12%{transform:translateY(1.5px) scale(1.04,0.96)}45%{transform:translateY(-9px) scale(0.97,1.03)}70%{transform:translateY(-2px) scale(1,1)}",
    dur: 1.5,
    ease: "ease-in-out",
  },
  laugh: {
    frames:
      "0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-3px) rotate(-2deg)}50%{transform:translateY(-1px) rotate(0)}75%{transform:translateY(-3px) rotate(2deg)}",
    dur: 0.85,
    ease: "ease-in-out",
  },
  walkbob: {
    frames: "0%,50%,100%{transform:translateY(0)}25%,75%{transform:translateY(-4px)}",
    dur: 1.1,
    ease: "ease-in-out",
  },
  // Anticipation, launch, apex, landing — read in that order starting from the
  // pose's own key frame, which is the apex. A jump whose still image is a
  // character standing on the ground would be a walk cycle with the legs out.
  jump: {
    frames:
      "0%,6%{transform:translateY(0) scale(1,1)}26%{transform:translateY(22px) scale(1.14,0.88)}38%{transform:translateY(24px) scale(1.18,0.84)}56%{transform:translateY(-6px) scale(0.92,1.1)}72%{transform:translateY(-2px) scale(0.97,1.03)}100%{transform:translateY(0) scale(1,1)}",
    dur: 1.9,
    ease: "ease-in-out",
  },
  breathe: {
    frames: "0%,100%{transform:scale(1,1)}50%{transform:scale(1.025,0.975)}",
    dur: 3.4,
    ease: "ease-in-out",
  },
  breatheSlow: {
    frames: "0%,100%{transform:scale(1,1)}50%{transform:scale(1.014,0.988)}",
    dur: 5,
    ease: "ease-in-out",
  },
  // --- head ---------------------------------------------------------------
  tilt: {
    frames: "0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}",
    dur: 4.6,
    ease: "ease-in-out",
  },
  look: {
    frames:
      "0%,12%{transform:rotate(0)}26%,42%{transform:rotate(-8deg)}56%,74%{transform:rotate(7deg)}90%,100%{transform:rotate(0)}",
    dur: 6.5,
    ease: "ease-in-out",
  },
  nod: {
    frames:
      "0%,100%{transform:rotate(0)}30%{transform:rotate(5deg)}55%{transform:rotate(1.5deg)}80%{transform:rotate(4deg)}",
    dur: 3.2,
    ease: "ease-in-out",
  },
  blink: {
    frames: "0%,92%,100%{transform:scaleY(1)}95%,96.4%{transform:scaleY(0.08)}",
    dur: 6,
    ease: "linear",
  },
  float: {
    frames:
      "0%,100%{transform:translateY(0) rotate(-7deg)}50%{transform:translateY(-6px) rotate(7deg)}",
    dur: 3.8,
    ease: "ease-in-out",
  },
  // --- arms ---------------------------------------------------------------
  wave: {
    frames:
      "0%,100%{transform:rotate(-4deg)}25%{transform:rotate(-26deg)}75%{transform:rotate(16deg)}",
    dur: 0.9,
    ease: "ease-in-out",
  },
  pointL: {
    frames:
      "0%,100%{transform:rotate(0)}28%{transform:rotate(8deg)}52%{transform:rotate(-2deg)}72%{transform:rotate(4deg)}",
    dur: 1.5,
    ease: "ease-in-out",
  },
  pointR: {
    frames:
      "0%,100%{transform:rotate(0)}28%{transform:rotate(-8deg)}52%{transform:rotate(2deg)}72%{transform:rotate(-4deg)}",
    dur: 1.5,
    ease: "ease-in-out",
  },
  holdL: {
    frames: "0%,100%{transform:rotate(2deg)}50%{transform:rotate(-2deg)}",
    dur: 2.6,
    ease: "ease-in-out",
  },
  holdR: {
    frames: "0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}",
    dur: 2.6,
    ease: "ease-in-out",
  },
  // A brush stroke: down the surface a little slower than it comes back up,
  // because paint is applied on the way down. Smaller than a wave on purpose -
  // the arm is resting against something, not signalling across a room.
  brush: {
    frames:
      "0%,100%{transform:rotate(-7deg)}45%{transform:rotate(6deg)}70%{transform:rotate(-1deg)}",
    dur: 1.35,
    ease: "ease-in-out",
  },
  swingF: {
    frames: "0%,100%{transform:rotate(13deg)}50%{transform:rotate(-13deg)}",
    dur: 1.1,
    ease: "ease-in-out",
  },
  swingB: {
    frames: "0%,100%{transform:rotate(-13deg)}50%{transform:rotate(13deg)}",
    dur: 1.1,
    ease: "ease-in-out",
  },
  // Thumbs on a controller: quick, small, and the two hands out of step.
  tapA: {
    frames: "0%,100%{transform:rotate(0)}45%{transform:rotate(-2.4deg)}",
    dur: 0.38,
    ease: "ease-in-out",
  },
  tapB: {
    frames: "0%,100%{transform:rotate(0)}55%{transform:rotate(2.4deg)}",
    dur: 0.47,
    ease: "ease-in-out",
  },
  typeA: {
    frames:
      "0%,100%{transform:rotate(0)}22%{transform:rotate(-2deg)}48%{transform:rotate(0.8deg)}74%{transform:rotate(-1.4deg)}",
    dur: 0.5,
    ease: "ease-in-out",
  },
  typeB: {
    frames:
      "0%,100%{transform:rotate(0)}30%{transform:rotate(1.8deg)}56%{transform:rotate(-0.8deg)}82%{transform:rotate(1.3deg)}",
    dur: 0.43,
    ease: "ease-in-out",
  },
  // --- legs ---------------------------------------------------------------
  stepF: {
    frames: "0%,100%{transform:rotate(-17deg)}50%{transform:rotate(17deg)}",
    dur: 1.1,
    ease: "ease-in-out",
  },
  stepB: {
    frames: "0%,100%{transform:rotate(17deg)}50%{transform:rotate(-17deg)}",
    dur: 1.1,
    ease: "ease-in-out",
  },
  tuckL: {
    frames:
      "0%,8%{transform:rotate(0)}30%,42%{transform:rotate(26deg)}60%,100%{transform:rotate(0)}",
    dur: 1.9,
    ease: "ease-in-out",
  },
  tuckR: {
    frames:
      "0%,8%{transform:rotate(0)}30%,42%{transform:rotate(-26deg)}60%,100%{transform:rotate(0)}",
    dur: 1.9,
    ease: "ease-in-out",
  },
  // --- held things --------------------------------------------------------
  pageflip: {
    frames: "0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}",
    dur: 3,
    ease: "ease-in-out",
  },
  glow: {
    frames: "0%,100%{opacity:1}50%{opacity:0.7}",
    dur: 2.2,
    ease: "ease-in-out",
  },
  sway: {
    frames: "0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}",
    dur: 2.6,
    ease: "ease-in-out",
  },
} as const satisfies Record<string, Keyframe>;

export type KeyframeId = keyof typeof KEYFRAMES;

/** What a given pose moves, and with which keyframe. */
export type MotionPlan = Partial<Record<MotionChannel, KeyframeId>>;

const POSE_MOTION: Record<PoseId, MotionPlan> = {
  idle: { body: "bob", breathe: "breathe", head: "look", blink: "blink", float: "float" },
  wave: {
    body: "bob",
    breathe: "breathe",
    head: "tilt",
    blink: "blink",
    float: "float",
    armR: "wave",
  },
  "point-left": {
    body: "bob",
    breathe: "breathe",
    head: "tilt",
    blink: "blink",
    float: "float",
    armL: "pointL",
  },
  "point-right": {
    body: "bob",
    breathe: "breathe",
    head: "tilt",
    blink: "blink",
    float: "float",
    armR: "pointR",
  },
  "hold-up": {
    body: "bob",
    breathe: "breathe",
    blink: "blink",
    float: "float",
    armR: "holdR",
    prop: "sway",
  },
  // Planted and concentrating. No bob — a player mid-match does not sway, and
  // the thumbs are where all the life is.
  controller: { breathe: "breathe", head: "tilt", blink: "blink", armL: "tapA", armR: "tapB" },
  "keyboard-mouse": {
    breathe: "breatheSlow",
    blink: "blink",
    armL: "typeA",
    armR: "typeB",
  },
  reading: { breathe: "breathe", head: "nod", blink: "blink", prop: "pageflip", armL: "holdL" },
  laptop: { breathe: "breatheSlow", blink: "blink", armL: "typeA", prop: "glow" },
  walking: {
    body: "walkbob",
    head: "tilt",
    blink: "blink",
    float: "float",
    armL: "swingB",
    armR: "swingF",
    legL: "stepF",
    legR: "stepB",
  },
  jumping: {
    body: "jump",
    blink: "blink",
    float: "float",
    armL: "holdL",
    armR: "holdR",
    legL: "tuckL",
    legR: "tuckR",
  },
  seated: {
    breathe: "breatheSlow",
    head: "tilt",
    blink: "blink",
    armL: "typeA",
    armR: "typeB",
  },
  // No body bob. The stroke is the whole point of this pose and a figure
  // bobbing under it would move the brush twice, in two rhythms, which reads
  // as a wobble rather than as work.
  painting: {
    breathe: "breathe",
    head: "nod",
    blink: "blink",
    float: "float",
    armL: "brush",
  },
};

/**
 * How a mood changes the body loop. An expression is a face swap everywhere
 * else in this directory; the one thing it is allowed to reach outside the
 * head for is the pace of the idle, because a character grinning with delight
 * while breathing like a metronome is the uncanny half of round one's problem
 * showing up in the timing instead of the drawing.
 */
function moodOverride(plan: MotionPlan, expression: ExpressionId): MotionPlan {
  if (plan.body === undefined) return plan;
  switch (expression) {
    case "excited":
      return { ...plan, body: "bounce" };
    case "laughing": {
      const { breathe: _breathe, ...rest } = plan;
      return { ...rest, body: "laugh" };
    }
    case "focused": {
      const { body: _body, head: _head, ...rest } = plan;
      return { ...rest, breathe: "breatheSlow" };
    }
    case "thinking":
      return { ...plan, breathe: "breatheSlow" };
    case "happy":
    case "surprised":
      return plan;
  }
}

export function motionPlan(pose: PoseId, expression: ExpressionId): MotionPlan {
  return moodOverride(POSE_MOTION[pose], expression);
}

/**
 * The class names one mascot instance uses. Every name carries the instance's
 * own id, because a page rendering fifty mascots injects fifty stylesheets
 * into one document and un-namespaced rules would have the last one win for
 * all of them.
 */
export type MotionClasses = Partial<Record<MotionChannel, string>>;

export function motionClasses(uid: string, plan: MotionPlan): MotionClasses {
  const out: MotionClasses = {};
  for (const channel of MOTION_CHANNELS) {
    if (plan[channel] !== undefined) out[channel] = `m-${channel}-${uid}`;
  }
  return out;
}

/**
 * Builds the stylesheet for one instance.
 *
 * `seed` staggers the loops so a row of characters does not blink and bob in
 * lockstep, which is the single thing that makes a lineup look like a sprite
 * sheet instead of a cast. The offset is expressed as a *fraction of each
 * animation's own duration*, not as a fixed number of seconds, which is what
 * keeps a walk cycle's arms, legs and body in step with each other while still
 * putting this walker half a stride ahead of the next one.
 */
export function motionCss(uid: string, seed: number, plan: MotionPlan): string {
  const phase = (seed % 1000) / 1000;
  const rules: string[] = [];
  const emitted = new Set<KeyframeId>();

  for (const channel of MOTION_CHANNELS) {
    const id = plan[channel];
    if (id === undefined) continue;
    const kf = KEYFRAMES[id];
    if (!emitted.has(id)) {
      emitted.add(id);
      rules.push(`@keyframes k-${id}-${uid}{${kf.frames}}`);
    }
    const cls = `m-${channel}-${uid}`;
    const delay = (-phase * kf.dur).toFixed(2);
    // A floating crown is the one channel with no rig point to turn about: it
    // is whatever shape the species hangs over its head, so it spins about its
    // own centre. Every other channel is anchored to a joint by an inline
    // `transform-origin`, which wins over this rule where a concept sets one.
    const box = channel === "float" ? "transform-box:fill-box;transform-origin:center;" : "";
    rules.push(
      `.${cls}{${box}animation:k-${id}-${uid} ${kf.dur}s ${kf.ease} ${delay}s infinite}`,
    );
  }

  return rules.join("");
}

/**
 * React's `useId` returns a value with delimiters in it, which is legal in an
 * HTML id and illegal in a CSS class selector. One sanitising pass at the top
 * of the component keeps every downstream name safe.
 */
export function safeId(reactId: string): string {
  return reactId.replace(/[^a-zA-Z0-9]/g, "");
}

/**
 * A small stable number per instance, used only to offset the animation
 * phases. Derived from the id so it survives re-renders; nothing about the
 * picture depends on it.
 */
export function seedFrom(uid: string): number {
  let total = 0;
  for (const char of uid) total = (total * 31 + char.charCodeAt(0)) % 997;
  return total;
}
