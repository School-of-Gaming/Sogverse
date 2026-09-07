/**
 * The three constructs that composite, and the only three.
 *
 * Everything else the library paints is opaque, and **a brand colour is opaque
 * always**: act, world, a family, a status, a pick exists at the value it was
 * authored at and nowhere else. A brand colour at a fraction of itself is a
 * colour nobody chose — it lands on a different pixel over every ground it
 * meets, so it cannot be measured, cannot be named, and drifts a step at a time
 * until one idea is spelled six ways.
 *
 * A **neutral** is not under that ban, because a neutral is not the brand
 * speaking. It carries an alpha in exactly one situation: where the alpha does
 * a job a solid cannot, which is to be a layer over a ground it does not know.
 * There are three such jobs and they are all here — the scrim over media, the
 * glass over whatever scrolls beneath it, and the hover layer over whatever
 * surface an element happens to sit on. A grey at alpha used as an *ink* is not
 * one of them: it is a duller grey, and the theme already ships the two inks
 * that grey would be reaching for.
 *
 * They are not three strengths of one thing. A scrim dims; a glass carries; a
 * hover lifts. That difference decides everything below.
 *
 * ## The scrim
 *
 * **A scrim is a tint that dims what is behind it, and nothing sits inside
 * it.** It is what makes a dialog's page recede, what darkens a picture so a
 * viewer's own controls read on top of it, what covers a tile while it is
 * busy. Its whole job is to take the ground down.
 *
 * **It is black, and black is not a brand colour.** Black is the purest thing
 * to tint with: it removes light and adds no hue, so a photograph under a
 * scrim is the same photograph, darker. Defining the scrim as the page's own
 * near-black ground would tint every picture toward the theme, which is a
 * claim the scrim has no business making — and it would invert under any
 * ground lighter than itself, so the construct would stop working the moment
 * it were used anywhere but here. That is why this value is not in `brand.ts`
 * and is not derived from a neutral: it is not part of the palette, it is the
 * absence of light applied over one.
 *
 * **Never blurred.** A blur says *there is a surface here*, and a scrim is not
 * a surface — it is the dimming of one. A blurred scrim reads as glass that
 * has swallowed its own contents.
 *
 * **Never a ground for text.** Nothing is authored *on* a scrim; things are
 * authored *over* it, on their own opaque surface. A label set directly on a
 * scrim has no measurable ground under it, because the ground is whatever the
 * scrim happens to be covering.
 *
 * ## The glass
 *
 * **Glass is a surface in its own right, with contents that have to stay
 * legible over whatever moves beneath it.** The sticky header, a jump-to bar
 * pinned over a scrolling page, a control resting on a video: each is a real
 * panel that reads as one thing while the page slides under it.
 *
 * So it is the page's own ground at high opacity plus a blur, and both halves
 * are load-bearing. The ground is what makes it a surface rather than a wash —
 * glass belongs to the page, unlike the scrim, which belongs to nothing. The
 * blur is what keeps its contents readable: it destroys the detail underneath
 * while keeping the colour, so a title on the header stays a title over a
 * photograph, a paragraph or a bright card alike.
 *
 * **The fallback is stronger on purpose.** Where the browser cannot blur, the
 * only thing left holding the contents legible is opacity, so it goes up and
 * the transparency it buys is spent instead on not looking broken. That is the
 * one place two strengths exist, and they are two answers to one question
 * rather than two designs.
 *
 * **Never a scrim.** Glass does not dim a page so something else can be read;
 * it carries its own contents. Reaching for it as a backdrop gets a blurred,
 * washed-out page with nothing on it.
 *
 * ## The hover layer
 *
 * **Hover is one layer, laid over whatever ground the element is already on.**
 * A row on the page, the same row on a card and the same row on a lifted panel
 * each answer the pointer by lifting one visible step from where they are, and
 * the layer is what makes that one construct instead of three.
 *
 * **This is why it is an alpha and not a grey.** A hover fill spelled as a
 * ground has to name the ground it lands on, so every surface the library ships
 * needs its own hover value, and a hover on the lightest of them has no value
 * left to name. Spelled as a layer, it needs none: it is transparent, so the
 * ground it lifts is whatever is underneath, including a ground the library
 * cannot know — a glass panel, a lifted panel inside a card inside a page.
 * That is the same argument the scrim and the glass are here for, applied to a
 * state rather than to a surface.
 *
 * **It is the foreground ink, not a fourth grey.** The ink is the brightest
 * thing the theme has, so a thin wash of it lifts every ground by roughly the
 * same visible step — the theme's own steps are a difference of 1.15 to 1.25,
 * and this layer clears that on all three. A grey at low alpha would lift the
 * dark grounds and sink the light one; a grey at full value would be a fourth
 * step in a ladder that was deliberately cut to three.
 *
 * **What it is not.** It is not a surface: nothing is authored on it, no
 * component takes it as a ground, and it never appears without a state
 * modifier in front of it. It is not a fourth neutral, and it does not enter
 * the grey ladder or the contrast ledger — a hovered row's text is measured
 * against the ground the row sits on, because the layer is thin enough not to
 * move that measurement in the direction that matters. And it is not a
 * selection: a state that has to survive the pointer leaving takes a mark —
 * an act edge, a check, a filled chip — as `brand.ts` says on the lifted grey.
 */

import type { Hex } from "./brand";
import type { NeutralId } from "./brand";

/**
 * The dimming layer: a colour and the fraction of it that lands.
 *
 * 70% is the strength at which a dialog's card, a viewer's control and the
 * page behind all three read at once. Below it a bright photograph keeps
 * enough of its own contrast to compete with what is on top; above it the
 * dimmed thing stops reading as a page that is still there.
 */
export const SCRIM = {
  hex: "#000000",
  alpha: 0.7,
} as const satisfies { readonly hex: Hex; readonly alpha: number };

/**
 * The glass recipe: which ground, how much of it, and how hard the blur.
 *
 * The ground is named rather than spelled, so glass follows the theme's page
 * colour wherever that goes — a glass panel is the page, thinned.
 *
 * 8px is the blur that erases text and edges underneath at the sizes these
 * panels are used, without smearing far enough to bleed a bright region out
 * past the panel's own edge. `fallbackOpacity` is what stands in where the
 * browser has no `backdrop-filter`; it is not a second design, it is the same
 * panel holding itself together without the blur's help.
 */
export const GLASS = {
  ground: "background",
  opacity: 0.7,
  fallbackOpacity: 0.9,
  blurPx: 8,
} as const satisfies {
  readonly ground: NeutralId;
  readonly opacity: number;
  readonly fallbackOpacity: number;
  readonly blurPx: number;
};

/**
 * The hover layer: which ink, and how thin.
 *
 * The ink is named rather than spelled, for the same reason the glass names its
 * ground — the layer is the theme's own ink, thinned, and follows it wherever
 * it goes.
 *
 * 8% is the conventional strength for a state layer and it is measured here
 * rather than assumed: over the three grounds it composites to `#363636` on the
 * lifted grey, `#2B2B2B` on the card and `#242424` on the page — steps of 1.25,
 * 1.23 and 1.21 against the ground each one lifts. The theme's own card-to-
 * lifted step is 1.15, and that is the step the greys ruling accepted as the
 * one a reader can actually find, so a layer clearing it on every ground is a
 * layer that reads as one step up wherever it lands. A thinner one would fail
 * on the lifted grey first, which is where most of a dashboard's rows are.
 *
 * There is one strength, with no `/n` a call site could vary: `bg-hover` is the
 * whole construct, exactly as `bg-scrim` is.
 */
export const HOVER = {
  ink: "foreground",
  alpha: 0.08,
} as const satisfies { readonly ink: NeutralId; readonly alpha: number };
