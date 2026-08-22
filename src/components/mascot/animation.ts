/**
 * The idle animation, as a stylesheet that lives *inside* the SVG.
 *
 * Two things follow from putting it there rather than in `globals.css` or a
 * CSS module. First, the drawing stays self-contained: lifting the rendered
 * `outerHTML` out of the page gives a standalone `.svg` file that still
 * breathes, with no build step and nothing to re-link. Second, the *shape*
 * never depends on the app's CSS — every fill, stroke and coordinate is an
 * attribute, and this stylesheet only ever adds motion on top. Strip it and
 * you have the exact same picture, standing still, which is what an email
 * client and a rasterised marketing image will each see.
 *
 * Motion is deliberately tiny — a two-and-a-half pixel rise, a two percent
 * breath, a blink, a degree and a half of head tilt. There is no
 * `prefers-reduced-motion` gate by explicit product decision, so the amplitude
 * has to be the thing that makes it harmless: nothing translates far, nothing
 * flashes, nothing parallaxes, and the whole loop is slow enough to read as
 * breathing rather than as movement.
 */

/**
 * The class names one mascot instance uses. Every name carries the instance's
 * own id, because a page rendering fifty mascots injects fifty stylesheets
 * into one document and un-namespaced rules would have the last one win for
 * all of them.
 */
export type AnimationClasses = {
  bob: string;
  breathe: string;
  blink: string;
  tilt: string;
  float: string;
  wave: string;
};

export function animationClasses(uid: string): AnimationClasses {
  return {
    bob: `mb${uid}`,
    breathe: `mr${uid}`,
    blink: `mk${uid}`,
    tilt: `mt${uid}`,
    float: `mf${uid}`,
    wave: `mw${uid}`,
  };
}

/**
 * Builds the stylesheet for one instance. `seed` staggers the loops so a row
 * of characters does not blink and bob in lockstep, which is the single thing
 * that makes a lineup look like a sprite sheet instead of a cast.
 */
export function animationCss(uid: string, seed: number): string {
  const c = animationClasses(uid);
  // Offsets are negative so every character starts mid-loop rather than
  // waiting its turn — a fleet that all begins at rest reads as a page that
  // has not finished loading.
  const d1 = (-((seed * 0.37) % 3.6)).toFixed(2);
  const d2 = (-((seed * 0.91) % 5.2)).toFixed(2);
  const d3 = (-((seed * 1.13) % 7)).toFixed(2);
  return [
    `@keyframes bob${uid}{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}`,
    `@keyframes br${uid}{0%,100%{transform:scale(1,1)}50%{transform:scale(1.012,0.982)}}`,
    `@keyframes bl${uid}{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(0.06)}}`,
    `@keyframes ti${uid}{0%,100%{transform:rotate(-1.5deg)}50%{transform:rotate(1.5deg)}}`,
    `@keyframes fl${uid}{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-4px) rotate(5deg)}}`,
    `@keyframes wv${uid}{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(9deg)}}`,
    `.${c.bob}{animation:bob${uid} 3.6s ease-in-out ${d1}s infinite}`,
    `.${c.breathe}{animation:br${uid} 5.2s ease-in-out ${d2}s infinite}`,
    `.${c.blink}{transform-box:fill-box;transform-origin:center;animation:bl${uid} 7s linear ${d3}s infinite}`,
    `.${c.tilt}{animation:ti${uid} 6.4s ease-in-out ${d2}s infinite}`,
    `.${c.float}{transform-box:fill-box;transform-origin:center;animation:fl${uid} 4.4s ease-in-out ${d1}s infinite}`,
    `.${c.wave}{animation:wv${uid} 1.5s ease-in-out ${d1}s infinite}`,
  ].join("");
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
