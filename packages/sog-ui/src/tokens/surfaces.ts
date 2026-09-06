/**
 * The two constructs that composite, and the only two.
 *
 * Everything else the library paints is opaque. A colour at a fraction of
 * itself is a colour nobody chose: it lands on a different pixel over every
 * ground it meets, so it cannot be measured, cannot be named, and drifts a
 * step at a time until one idea is spelled six ways. The scrim and the glass
 * are the exceptions because they are the only two jobs where the ground
 * genuinely is not ours — a photograph, a video, a page scrolling underneath —
 * and blending at render time is the only mechanism there is. So they are
 * defined once, here, and a surface that wants to see through takes one of
 * them or is opaque.
 *
 * They are not two strengths of one thing. A scrim dims; a glass carries. That
 * difference decides everything below.
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
