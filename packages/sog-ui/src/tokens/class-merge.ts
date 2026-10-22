/**
 * The class merger, taught the theme.
 *
 * A consumer's `cn` resolves conflicts between utility classes with
 * tailwind-merge, which knows stock Tailwind and nothing of this theme. It
 * reads a `text-*` or `bg-*` class it does not recognise as a colour, and that
 * guess is wrong for some of what the theme emits, in a way that fails quietly:
 * a class is dropped, the element still renders, and the diff that caused it
 * looks correct. The theme is this library's, so the merger's knowledge of it is
 * too, and a consumer merges with {@link mergeClasses} rather than with plain
 * tailwind-merge.
 *
 * Only what the default guess gets wrong is registered. Every colour token —
 * the grounds, the inks, act, world, the families, the statuses, the picks, the
 * scrim — compiles to a colour property and is read as a colour already, so
 * listing them would change nothing.
 */

import { extendTailwindMerge } from "tailwind-merge";

import { typeSizes } from "./typography";

/**
 * Every `text-*` utility the scale produces, derived from the sizes the theme
 * declares rather than listed, so a step added to the scale is a size to the
 * merger the moment it is a token.
 *
 * Unregistered, `cn("text-display", "text-foreground")` returned `text-foreground`:
 * the heading lost its size to an ink. Registered as sizes, a step survives any
 * colour beside it, and a step and a stock size (`text-2xl`) conflict, the last
 * one winning, as two sizes on one element should.
 */
const SCALE_UTILITIES = typeSizes().map(({ cssName }) =>
  cssName.slice("--text-".length),
);

/**
 * A `className` merge that knows the theme. Takes and returns what
 * tailwind-merge's `twMerge` does.
 *
 * **`bg-hover` is a background image.** The hover layer is emitted in the image
 * namespace so it composites over whatever ground an element already has, and
 * a ground beside it is the point: `cn("bg-lifted", "hover:bg-hover")` must keep
 * both. Read as a colour, the layer replaced the ground it exists to sit on. It
 * joins the background-image group, so it conflicts only with another image
 * (`bg-none`, a gradient) — which it is.
 *
 * **`bg-scrim` stays a background colour**, which is what it compiles to. It is
 * a ground, not a layer: a scrim beside another ground is two values for one
 * property, and leaving both would hand the winner to stylesheet order rather
 * than to the order the caller wrote. So the last one written wins.
 *
 * **`glass` is a ground too.** Its fill is a `background-color`, so beside
 * another ground the two are the same property and, kept together, the
 * stylesheet's order decided which showed — the opaque fill, usually, which
 * leaves a pane with a blur and no glass. It joins the background-colour group
 * for the same reason the scrim stays there: the last ground written is the
 * one the element wears. A layer on glass (`hover:bg-hover`) is untouched.
 */
export const mergeClasses = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: SCALE_UTILITIES }],
      "bg-image": [{ bg: ["hover"] }],
      "bg-color": ["glass"],
    },
  },
});
