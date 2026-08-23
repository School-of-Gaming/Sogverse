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
 * ## Round three anchored the feet
 *
 * Round two's amplitudes were legible and one of them was wrong: every
 * standing pose translated the whole figure four pixels up and back down, so
 * the entire fleet — every species, every mood — hovered a little, all the
 * time. A character whose soles leave the ground is not standing in the scene,
 * it is pasted onto it, and the ground shadow sitting still underneath made it
 * worse rather than better.
 *
 * So the resting loops were rebuilt on primitives that *cannot* move a sole,
 * both anchored at the species' own ground line: a scale for the breath and a
 * shear for the weight shift. The character still rises — the breath grows it
 * in y by two and a half percent, which lifts the head about four pixels, the
 * same distance the bob used to travel — but it rises out of its own feet
 * instead of off the floor. Leaving the ground is now something a species opts
 * into (`rig.hovers`) or an action asks for (`walking`, `jumping`).
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
  /**
   * The whole figure, anchored at the ground line: the weight shift, the walk
   * lift, the jump arc, and — for a species that flies — the hover.
   */
  "body",
  /** The chest, scaled about the ground line so the soles do not move. */
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
  // The weight shift, and the reason the idle no longer floats.
  //
  // Every keyframe on the `body` and `breathe` channels is anchored at the
  // species' own ground line, and the two primitives used there are chosen for
  // one property: neither can move a sole. A scale about the ground line pins
  // y = ground; a **shear** pins it too, and pins x as well — `skewX` maps
  // (x, y) to (x + (y - ground)·tan θ, y), so the head leans by three pixels,
  // the hips by one and a half, and the feet by nothing at all. A rotation was
  // the obvious alternative and is the one thing that does not work: turning
  // the figure a degree and a half about the centre of the foot line lifts the
  // outboard foot half a pixel off the ground, every cycle, forever.
  weight: {
    frames: "0%,100%{transform:skewX(-1.6deg)}50%{transform:skewX(1.6deg)}",
    dur: 5.2,
    ease: "ease-in-out",
  },
  // Excitement, without leaving the ground. Round two spent it as a nine-pixel
  // hop of the whole rigid figure — legs included, and the legs did not move,
  // which is what a hover looks like. The same energy read as a knee bend: a
  // fast crouch into a stretch, anchored at the soles, so the head still
  // travels about eight pixels and the feet still travel none.
  springUp: {
    frames:
      "0%,100%{transform:scale(1,1)}12%{transform:scale(1.05,0.94)}45%{transform:scale(0.96,1.07)}70%{transform:scale(1.01,0.99)}",
    dur: 1.5,
    ease: "ease-in-out",
  },
  // A laugh is a body shaking, not a body rising. The rock is a shear so the
  // feet stay put, and the small vertical pump under it is the breath the
  // laughing plan drops.
  laugh: {
    frames:
      "0%,100%{transform:skewX(0) scale(1,1)}25%{transform:skewX(-2.4deg) scale(1.01,0.985)}50%{transform:skewX(0) scale(0.995,1.012)}75%{transform:skewX(2.4deg) scale(1.01,0.985)}",
    dur: 0.85,
    ease: "ease-in-out",
  },
  // The one loop that is *allowed* to leave the ground, and only for a species
  // whose rig says it flies. Rise slower than it settles, so it reads as being
  // held up rather than as being thrown.
  hover: {
    frames: "0%,100%{transform:translateY(0)}46%{transform:translateY(-7px)}",
    dur: 3.6,
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
  // Anchored at the ground line, so growing in y raises the head and the
  // shoulders and leaves the soles where they are — which is what replaced the
  // bob. Round two squashed instead (y *down*, x up), which cost the figure
  // height on the inhale and is why the bob had to exist to put it back.
  // Slightly less in x than in y: a chest deepens more than it widens.
  breathe: {
    frames: "0%,100%{transform:scale(1,1)}50%{transform:scale(1.015,1.026)}",
    dur: 3.4,
    ease: "ease-in-out",
  },
  breatheSlow: {
    frames: "0%,100%{transform:scale(1,1)}50%{transform:scale(1.008,1.014)}",
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
  // A blink is short and it is a *shape*: the white squashes to a line about
  // its own middle and comes back, with nothing drawn over it. Timed in real
  // units rather than in percentages that happened to look right — over a 4.6
  // second loop, 60ms to close, 120ms shut, 60ms to open. Round two spent
  // 180ms closing and 216ms opening, which is a slow deliberate wink; this is
  // a blink. The period sits inside the 3-6s a resting face blinks at, and
  // the per-instance phase offset means no two characters blink together.
  //
  // The floor is a fraction rather than a thickness because one keyframe is
  // shared by every instance, and eyes here differ by more than three to one
  // — a 13-unit pair on a person, a 42-unit disc on a cyclops. Eight percent
  // leaves the smallest of them about a unit thick, which still paints a line
  // at avatar size rather than an eye that briefly vanishes.
  blink: {
    frames: "0%,92%,97.3%,100%{transform:scaleY(1)}93.3%,96%{transform:scaleY(0.08)}",
    dur: 4.6,
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

/**
 * What each pose moves.
 *
 * **A standing or seated pose never translates the whole figure.** The `body`
 * channel it uses is a shear about the ground line and the `breathe` under it
 * is a scale about the same line, so a character at rest expands, settles and
 * leans with its soles exactly where the still frame put them. The two poses
 * that *do* translate are the two whose subject is leaving the ground —
 * `walking` lifts over each planted leg while the legs swing under it, and
 * `jumping` is an arc — and those move the feet because the action does.
 */
const POSE_MOTION: Record<PoseId, MotionPlan> = {
  idle: { body: "weight", breathe: "breathe", head: "look", blink: "blink", float: "float" },
  wave: {
    body: "weight",
    breathe: "breathe",
    head: "tilt",
    blink: "blink",
    float: "float",
    armR: "wave",
  },
  "point-left": {
    body: "weight",
    breathe: "breathe",
    head: "tilt",
    blink: "blink",
    float: "float",
    armL: "pointL",
  },
  "point-right": {
    body: "weight",
    breathe: "breathe",
    head: "tilt",
    blink: "blink",
    float: "float",
    armR: "pointR",
  },
  "hold-up": {
    body: "weight",
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
      return { ...plan, body: "springUp" };
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

/**
 * The one place a species is allowed to leave the ground at rest.
 *
 * It swaps exactly the weight shift, which is the loop a *standing* character
 * runs, and nothing else. A flying species walking, jumping or hunched over a
 * keyboard is doing something specific with its body, and a hover laid over
 * that would be two ideas about the same figure at once; excitement and
 * laughter already own the channel and keep it. So the substitution is written
 * as "wherever this plan says stand, say float instead", and a pose added
 * later inherits the right answer with nobody editing this.
 */
function hoverOverride(plan: MotionPlan, hovers: boolean): MotionPlan {
  if (!hovers || plan.body !== "weight") return plan;
  return { ...plan, body: "hover" };
}

export function motionPlan(
  pose: PoseId,
  expression: ExpressionId,
  /** `rig.hovers` — true only for a species that flies and means to. */
  hovers: boolean,
): MotionPlan {
  return hoverOverride(moodOverride(POSE_MOTION[pose], expression), hovers);
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
