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
 * ## Round four gave the motion a shape
 *
 * Two failures, one of timing and one of direction, and one note from Kyle.
 *
 * **The walk was a jumping jack.** It swung each leg about its hip from a
 * stance already splayed fifteen units, which moves a foot sideways; two feet
 * scissoring in opposite directions is a star jump done at walking pace. The
 * cast is drawn front-on and is staying that way — a side profile would mean
 * redrawing every species — so the gait was rebuilt in implied *depth*: the
 * stepping leg at full extension with its sole on the ground line, the
 * trailing one foreshortened, as a y-scale about the hip socket that cannot
 * move a foot in x. The reference is a Pokemon Go walk: the group is coming
 * down the path towards the camera, not crossing in front of it.
 *
 * **The jump floated.** It spent nearly half its cycle drifting near the top
 * under one `ease-in-out`, and buried its feet under the floor on the frames
 * that were supposed to sell the contact. It is now real jump timing —
 * anticipation, an explosive extension, a fast rise, a short hang, a fast
 * fall, a landing squash and a beat standing still — with per-segment easings,
 * and with the grounded frames computed so the soles land exactly on the
 * ground line. Its register is the *jumppa*: the mid-club exercise break where
 * a room of kids gets off the computers and moves.
 *
 * **And the resting loops never rested.** Kyle: the bobbing "adds to the
 * liveliness but doing it indefinitely with no break looks exhausting". So
 * every resting loop now holds its motion in the front of a much longer cycle
 * and goes quiet for the back of it — two breaths and a sway, then several
 * seconds of near-still — with a whisper left in the hold so it reads as a
 * rest rather than as a freeze-frame, and with the blink left on its own timer
 * so something is still alive during it.
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

import { JUMP_GROUND_DROP } from "./poses";
import { n } from "./rig";
import type { ExpressionId, PoseId } from "./vocabulary";

/**
 * One jump keyframe with the character standing on the ground line.
 *
 * The jump pose draws its apex, so every grounded frame has to bring the whole
 * figure back down by `JUMP_GROUND_DROP`. The subtlety is that the same
 * keyframe is also squashing or stretching the body about the ground line, and
 * a scale applied about that line moves a sole that is not on it: a foot drawn
 * `d` above the origin lands at `d · sy` above it, so the translate that puts
 * it back has to be `d · sy` too, not `d`. Round two used a flat 22 against a
 * 0.88 squash and buried the feet two and a half units under the floor at the
 * exact frames that were supposed to sell the contact.
 */
function grounded(sx: number, sy: number): string {
  return `translateY(${n(JUMP_GROUND_DROP * sy)}px) scale(${sx},${sy})`;
}

/** A jump keyframe in the air, measured from the apex the pose draws. */
function airborne(aboveApex: number): string {
  return `translateY(${n(-aboveApex)}px) scale(1,1)`;
}

/**
 * What can move. Each channel is one group in the drawing and gets at most one
 * animation, so the class name can simply be the channel.
 */
export const MOTION_CHANNELS = [
  /**
   * The whole figure, anchored at the ground line: the weight shift, the walk
   * rise and sway of the walk, the jump arc, and — for a species that flies —
   * the hover.
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
  /**
   * Each leg, transformed about its own hip socket. Rotation is the one thing
   * it must not do in a walk — that is what scissors the feet — so the walk
   * scales instead and only the airborne jump tuck turns a leg at all.
   */
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
  //
  // Round four gave it a phrase, and a rest at neutral. See the note on
  // `breathe`, which owns the reasoning and the shared cycle length.
  weight: {
    frames:
      "0%,14%{transform:skewX(0deg)}30%{transform:skewX(-1.7deg)}52%{transform:skewX(1.7deg)}70%,100%{transform:skewX(0deg)}",
    dur: 10,
    ease: "ease-in-out",
  },
  // Excitement, without leaving the ground. Round two spent it as a nine-pixel
  // hop of the whole rigid figure — legs included, and the legs did not move,
  // which is what a hover looks like. The same energy read as a knee bend: a
  // fast crouch into a stretch, anchored at the soles, so the head still
  // travels about eight pixels and the feet still travel none.
  //
  // Two springs and then a settle, because a character that springs forever is
  // not excited about anything, it is a metronome.
  springUp: {
    frames:
      "0%{transform:scale(1,1)}7%{transform:scale(1.05,0.94)}20%{transform:scale(0.96,1.07)}28%{transform:scale(1.01,0.99)}35%{transform:scale(1.04,0.95)}47%{transform:scale(0.97,1.06)}56%{transform:scale(1,1)}76%{transform:scale(1.005,1.008)}100%{transform:scale(1,1)}",
    dur: 3.6,
    ease: "ease-in-out",
  },
  // A laugh is a body shaking, not a body rising. The rock is a shear so the
  // feet stay put, and the small vertical pump under it is the breath the
  // laughing plan drops. Four shakes, a dying fifth, then a beat of quiet: a
  // laugh has an end, and a character still shaking a minute later is having
  // a fit.
  laugh: {
    frames:
      "0%{transform:skewX(0deg) scale(1,1)}8%{transform:skewX(-2.4deg) scale(1.01,0.985)}16%{transform:skewX(0deg) scale(0.995,1.012)}24%{transform:skewX(2.4deg) scale(1.01,0.985)}32%{transform:skewX(0deg) scale(0.995,1.012)}40%{transform:skewX(-2.2deg) scale(1.01,0.985)}48%{transform:skewX(0deg) scale(0.997,1.008)}56%{transform:skewX(1.3deg) scale(1.005,0.995)}64%,100%{transform:skewX(0deg) scale(1,1)}",
    dur: 3.2,
    ease: "ease-in-out",
  },
  // The one loop that is *allowed* to leave the ground, and only for a species
  // whose rig says it flies. Rise slower than it settles, so it reads as being
  // held up rather than as being thrown. Two rises and then a long shallow
  // drift — a hover that stopped dead would read as a hanging prop, so this
  // one's rest keeps a whisper instead of coming to zero.
  hover: {
    frames:
      "0%{transform:translateY(0)}18%{transform:translateY(-7px)}36%{transform:translateY(0)}54%{transform:translateY(-7px)}72%{transform:translateY(0)}86%{transform:translateY(-2px)}100%{transform:translateY(0)}",
    dur: 10,
    ease: "ease-in-out",
  },
  // ## The walk, rebuilt front-on
  //
  // Round three swung each leg about its hip by seventeen degrees from a
  // stance already fifteen units wide, which moves a foot *sideways*. Two feet
  // moving sideways in opposite directions is a jumping jack, and that is what
  // it read as. Every species here is drawn front-on and none of them is
  // getting a side profile, so the gait has to happen in implied depth: the
  // stepping leg is the one at full extension with its sole on the ground
  // line, and the trailing one is *foreshortened* — shorter, sole a little up,
  // bow folded tighter — which is what a leg going away from the viewer does
  // to a front-on drawing. `strideA`/`strideB` are exactly that, as a y-scale
  // about the hip socket, and a y-scale cannot change an x, so the scissor is
  // gone by construction rather than tuned away.
  //
  // This keyframe carries the rise and fall and the sway. It is deliberately
  // not a translate: a walker's *planted* foot does not leave the floor, so
  // the rise is a scale about the ground line — the figure grows out of its
  // own stance leg, head travelling about four pixels, soles travelling none —
  // and the lean is the same shear the idle uses. Two rises per cycle, one per
  // step, each peaking at mid-stance where a leg is straight under the body,
  // with the lean going over whichever leg that is.
  walkstep: {
    frames:
      "0%,100%{transform:scale(1,1.024) skewX(1.8deg)}25%{transform:scale(1,0.986) skewX(0deg)}50%{transform:scale(1,1.024) skewX(-1.8deg)}75%{transform:scale(1,0.986) skewX(0deg)}",
    dur: 1,
    ease: "ease-in-out",
  },
  // ## The jumppa hop
  //
  // Named for the exercise break in the middle of a club session — the two
  // minutes where a room of kids gets off the computers and moves — and timed
  // like one rather than like a moon landing. Round two spent forty-four
  // percent of its cycle drifting about near the top under a single
  // `ease-in-out`, which is the definition of floaty. Real jump timing is
  // nearly all acceleration and one held instant: anticipation, an explosive
  // extension, a fast rise, a *short* hang, a fast fall, a squash deeper than
  // the crouch, and then a beat standing still before the next hop. Seven
  // percent of this cycle is the hang and thirty percent is the beat.
  //
  // The per-segment easings are what make it read; one curve across the whole
  // thing cannot be fast off the floor and slow at the apex at the same time.
  // A keyframe's timing function governs the segment that *starts* there.
  //
  // Grounded frames are built rather than typed, so the soles land exactly on
  // the ground line under any squash — see `grounded`.
  jump: {
    frames: [
      "0%{transform:" + grounded(1, 1) + "}",
      "8%{transform:" + grounded(1, 1) + ";animation-timing-function:cubic-bezier(0.4,0,0.6,1)}",
      "19%{transform:" + grounded(1.07, 0.86) + ";animation-timing-function:cubic-bezier(0.5,0,1,1)}",
      "24%{transform:" + grounded(0.95, 1.07) + ";animation-timing-function:cubic-bezier(0.05,0.8,0.3,1)}",
      "33%{transform:" + airborne(0) + ";animation-timing-function:linear}",
      "40%{transform:" + airborne(1) + ";animation-timing-function:cubic-bezier(0.7,0,0.9,0.5)}",
      "49%{transform:" + grounded(1, 1) + ";animation-timing-function:cubic-bezier(0.2,0.9,0.4,1)}",
      "53%{transform:" + grounded(1.12, 0.79) + ";animation-timing-function:cubic-bezier(0.2,0.8,0.4,1)}",
      "62%{transform:" + grounded(0.97, 1.04) + "}",
      "70%,100%{transform:" + grounded(1, 1) + "}",
    ].join(""),
    dur: 1.8,
    ease: "ease-in-out",
  },
  // Anchored at the ground line, so growing in y raises the head and the
  // shoulders and leaves the soles where they are — which is what replaced the
  // bob. Round two squashed instead (y *down*, x up), which cost the figure
  // height on the inhale and is why the bob had to exist to put it back.
  // Slightly less in x than in y: a chest deepens more than it widens.
  //
  // ## The idle break (round four)
  //
  // The amplitude was right and the *phrasing* was wrong: one breath cycle
  // repeated end to end, forever, with nothing between them. Kyle's word for
  // it was exhausting, and that is the correct diagnosis — a body at ease
  // breathes in phrases and then rests, and a body that never rests is a body
  // doing something. So every resting loop is now long enough to hold its
  // motion in the *front* of the cycle and go quiet for the back of it: two
  // breaths, then three and a half seconds of near-still, with one shallow
  // whisper inside the hold so that it reads as a rest rather than as a
  // freeze-frame.
  //
  // `weight` shares this ten-second cycle but starts and stops at different
  // points inside it, which is the difference between two loops offset from
  // one another and two loops restarting together; it also comes to rest at
  // neutral rather than mid-lean, because a figure parked in a lean for three
  // seconds is a figure leaning, not resting. The blink keeps its own
  // 4.6-second timer and is deliberately *not* folded in: it fires during the
  // holds, and that is the thing that keeps a still character alive.
  breathe: {
    frames:
      "0%{transform:scale(1,1)}16%{transform:scale(1.015,1.026)}32%{transform:scale(1,1)}48%{transform:scale(1.015,1.026)}64%{transform:scale(1,1)}80%{transform:scale(1.004,1.007)}100%{transform:scale(1,1)}",
    dur: 10,
    ease: "ease-in-out",
  },
  breatheSlow: {
    frames:
      "0%{transform:scale(1,1)}15%{transform:scale(1.008,1.014)}30%{transform:scale(1,1)}45%{transform:scale(1.008,1.014)}60%{transform:scale(1,1)}80%{transform:scale(1.003,1.005)}100%{transform:scale(1,1)}",
    dur: 12,
    ease: "ease-in-out",
  },
  // --- head ---------------------------------------------------------------
  // A head tilt is a thing you *do* and then hold, not an oscillation. One
  // tilt each way with the second one held for a second, and then most of the
  // cycle straight ahead — the same phrasing as the breath, and for the same
  // reason: a head swinging left-right without pause is a metronome wearing a
  // face.
  tilt: {
    frames:
      "0%,9%{transform:rotate(0deg)}21%{transform:rotate(-3deg)}33%,44%{transform:rotate(2.8deg)}57%,100%{transform:rotate(0deg)}",
    dur: 11,
    ease: "ease-in-out",
  },
  // Already built on holds; round four only widened the last one, so the look
  // around ends facing the viewer and stays there for four seconds.
  look: {
    frames:
      "0%,10%{transform:rotate(0)}21%,33%{transform:rotate(-8deg)}44%,58%{transform:rotate(7deg)}69%,100%{transform:rotate(0)}",
    dur: 9.5,
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
  // The walk's counter swing, which is a *foreshortening* and not a rotation,
  // for exactly the reason the legs are. Round three swung both arms thirteen
  // degrees about their shoulders, and because the two arms are mirror images
  // a mirrored rotation moves both hands the same way across the screen — two
  // arms flapping in unison rather than counter-swinging. What a front-on
  // viewer actually sees of an arm swing is one hand riding higher on its
  // shorter, forward arm and the other hanging lower on its longer one, so
  // that is what these do: `scaleY` about the shoulder, out of phase with each
  // other, with a shared three-degree sway that runs *with* the torso lean
  // rather than against it. They share the walk's one-second cycle so arms,
  // legs and body stay in step under the per-instance phase offset, which is a
  // fraction of each animation's own duration.
  swingF: {
    frames:
      "0%,100%{transform:rotate(3deg) scaleY(0.93)}50%{transform:rotate(-3deg) scaleY(1.03)}",
    dur: 1,
    ease: "ease-in-out",
  },
  swingB: {
    frames:
      "0%,100%{transform:rotate(3deg) scaleY(1.03)}50%{transform:rotate(-3deg) scaleY(0.93)}",
    dur: 1,
    ease: "ease-in-out",
  },
  // The hop's arm swing: down at the sides through the crouch, thrown up on
  // the launch, held up over the apex, and down again to meet the landing.
  // Identity is the *raised* arm, because that is where the jump pose puts the
  // hands and therefore what the still frame has to show, so every grounded
  // frame here is a large rotation rather than a small one — around a hundred
  // and thirty degrees, which is what it takes to bring an arm from over the
  // head to hanging at the side. Anything much less finishes with the arm
  // sticking straight out sideways, which is a scarecrow rather than a
  // character standing between hops; the sweep passing through horizontal on
  // the way is fine and is what an arm does.
  //
  // 132 is a compromise and worth knowing about before nudging it. The angle
  // that reads as "hanging" depends on where a build's shoulder is relative to
  // the raised hand, and the cast does not agree: a bear or a kid wants about
  // 122 and a long adult with high shoulders wants about 152, because on the
  // adult the hand is nearly at shoulder height so a shallow turn swings it
  // across the chest rather than down. Rasterised at 110 / 122 / 132 / 142 /
  // 152 across five builds, 132 is the one where every build reads as arms at
  // its sides — some at the hem, some meeting low in front — and none reads as
  // a scarecrow or as arms folded across the chest.
  //
  // The `scaleY` riding along with it is the same foreshortening the walk uses
  // and it earns its place twice: an arm at the side rather than overhead is
  // partly turned away from a front-on viewer and should read shorter, and it
  // is what keeps a long-armed species inside its own footprint. A bear's arm
  // is longer than its leg, so a pure rotation swung its paw several units
  // *below* the ground line — under the shadow — at the bottom of the swing.
  //
  // Shares the jump's 1.8s cycle and its keyframe percentages, so the arms
  // reach the top on the same frame the feet leave the floor.
  hopArmL: {
    frames:
      "0%,8%{transform:rotate(-132deg) scaleY(0.845)}19%{transform:rotate(-145deg) scaleY(0.825)}24%{transform:rotate(-104deg) scaleY(0.93)}33%,40%{transform:rotate(0deg) scaleY(1)}49%{transform:rotate(-58deg) scaleY(0.97)}53%{transform:rotate(-130deg) scaleY(0.875)}62%{transform:rotate(-142deg) scaleY(0.825)}70%,100%{transform:rotate(-132deg) scaleY(0.845)}",
    dur: 1.8,
    ease: "ease-in-out",
  },
  hopArmR: {
    frames:
      "0%,8%{transform:rotate(132deg) scaleY(0.845)}19%{transform:rotate(145deg) scaleY(0.825)}24%{transform:rotate(104deg) scaleY(0.93)}33%,40%{transform:rotate(0deg) scaleY(1)}49%{transform:rotate(58deg) scaleY(0.97)}53%{transform:rotate(130deg) scaleY(0.875)}62%{transform:rotate(142deg) scaleY(0.825)}70%,100%{transform:rotate(132deg) scaleY(0.845)}",
    dur: 1.8,
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
  // The step, as a foreshortening rather than as a swing. Each leg group is
  // already anchored at its own hip socket, so a y-scale there shortens the
  // leg from the hip down: the sole rises, the knee's outward bow keeps its
  // width and therefore folds tighter, and the foot's x does not move at all,
  // which is the whole reason a front-on walk can work. Full extension is
  // `scaleY(1)` — the planted frame, and it is exactly 1 so the stance sole
  // sits on the ground line the pose drew it on, whatever the body is doing
  // above it.
  //
  // The three pixels of lift on top of the scale are for the short-legged
  // half of the cast. A scale takes a *proportion* of the leg away, so a
  // Porukka adult with sixty-six units between hip and sole gets nine and a
  // Kaveri kid with thirty-six under a tunic gets five, of which only the part
  // below the hem is visible at all; the flat term brings the small ones up to
  // something a reader can see without sending the long ones over the top. It
  // is safe on the anchor because it appears only at the *lifted* extreme —
  // the planted keyframe is exactly `scaleY(1)` with no translate, so the
  // stance sole is on the line the pose drew it on.
  //
  // `strideB` is `strideA` shifted half a cycle, written out rather than
  // achieved with a delay because the delay is already spoken for by the
  // per-instance phase offset. They cross a shade under full extension around
  // the quarter points, which lifts both soles by about a unit for an instant
  // at the passing stride; a fifth of a pixel at avatar size, and the price of
  // not having two legs snap between states.
  strideA: {
    frames:
      "0%,22%{transform:translateY(0) scaleY(1)}50%{transform:translateY(-3px) scaleY(0.86)}78%,100%{transform:translateY(0) scaleY(1)}",
    dur: 1,
    ease: "ease-in-out",
  },
  strideB: {
    frames:
      "0%{transform:translateY(-3px) scaleY(0.86)}28%,72%{transform:translateY(0) scaleY(1)}100%{transform:translateY(-3px) scaleY(0.86)}",
    dur: 1,
    ease: "ease-in-out",
  },
  // The hop's tuck. Identity on every grounded frame — the crouch, the
  // extension, the touchdown and the beat — which is what lets the body
  // keyframe put the soles exactly on the ground line with no second transform
  // underneath them to account for. In the air the legs fold: shorter by a
  // fifth about the hip, and turned a few degrees inward so the two soles come
  // together the way a hop's do. Shares the jump's cycle and its percentages,
  // so the fold happens on the frame the feet leave the floor.
  tuckL: {
    frames:
      "0%,24%{transform:rotate(0deg) scaleY(1)}33%,40%{transform:rotate(9deg) scaleY(0.82)}49%,100%{transform:rotate(0deg) scaleY(1)}",
    dur: 1.8,
    ease: "ease-in-out",
  },
  tuckR: {
    frames:
      "0%,24%{transform:rotate(0deg) scaleY(1)}33%,40%{transform:rotate(-9deg) scaleY(0.82)}49%,100%{transform:rotate(0deg) scaleY(1)}",
    dur: 1.8,
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
 * leans with its soles exactly where the still frame put them.
 *
 * **Nor does a walk.** A walker's planted foot does not leave the floor either,
 * so the rise and fall of the gait is a scale about the same ground line and
 * the lean is the same shear; what moves the feet is the legs' own channel,
 * lifting the trailing sole while the stance one stays down. `jumping` is the
 * single pose that translates, because a jump is an arc and the feet leave the
 * ground because the action does — and even there the frames that touch down
 * put the soles exactly on the line.
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
  // Strolling towards you — the shape of a Pokemon Go walk, where the gamers
  // and the gedu are coming down the path at the camera rather than crossing
  // it. Nothing in here rotates a leg.
  walking: {
    body: "walkstep",
    head: "tilt",
    blink: "blink",
    float: "float",
    armL: "swingB",
    armR: "swingF",
    legL: "strideA",
    legR: "strideB",
  },
  // The jumppa hop. The crouch and the landing squash belong to the body
  // keyframe, which compresses the whole figure about the ground line and so
  // bends and straightens the legs for free; the legs' own channel does the
  // airborne tuck and nothing else, sitting at identity for every frame that
  // touches the floor.
  jumping: {
    body: "jump",
    blink: "blink",
    float: "float",
    armL: "hopArmL",
    armR: "hopArmR",
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
  // Only the *resting* loop is the mood's to change. `weight` is the one thing
  // a standing character does with its body when it is not doing anything, so
  // swapping it for a spring or a laugh is a legitimate change of register.
  // The walk and the hop are not that: their body channel *is* the action, and
  // an excited jump that traded its arc for a spring simply stopped jumping,
  // while a focused one — the mood that deletes the channel — stood still in
  // mid-air. Reading the channel rather than the pose id means a pose added
  // later gets the right answer without anybody editing this.
  if (plan.body !== "weight") return plan;
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
