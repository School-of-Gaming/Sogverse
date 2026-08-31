/**
 * The thumbnail row's arithmetic — the whole of it.
 *
 * **Nothing here measures anything**, and that is the point rather than a
 * detail. A session photo's width and height are stored beside its id precisely
 * so every renderer can size its box from data: the server's HTML and the
 * browser's first paint compute the same number, the box is already the right
 * shape before a single byte of JPEG has been decoded, and the feed does not
 * shuffle itself as five images land one after another. The report clamp beside
 * this file works the same way and for the same reason.
 */

/**
 * The height a thumbnail is drawn at, in CSS pixels, at the wide breakpoint.
 *
 * A **fixed height with a natural width** is the whole layout idea: mixed
 * ratios — 16:9 screenshots mostly, with 1:1 and portrait among them — share a
 * baseline and a cap without any of them being cropped, and the row wraps when
 * it runs out of width. A fixed *width* would have done the opposite, letting a
 * portrait photo tower over the landscape one beside it.
 *
 * The number is here (and not only in a class name) because it is also the
 * intrinsic height handed to the image optimizer, which is what picks the
 * variant actually fetched. The narrow breakpoint draws the same thumbnails
 * shorter — a ratio is a ratio at either height, so the optimizer is told about
 * the taller of the two and the shorter one is served the same bytes.
 */
export const SESSION_PHOTO_THUMB_HEIGHT = 144;

/**
 * How far from square a thumbnail's *box* is allowed to get, either way.
 *
 * Real session photos never approach this: the client normalizes to a ~2048 px
 * longest edge and the shapes in practice run from 9:16 to 16:9. It exists so a
 * degenerate row — the table's CHECK permits 4096×1 — cannot emit an absurd
 * width into the markup and blow the row apart. Past the limit the box stops
 * stretching and the picture letterboxes inside it (every image is drawn
 * `contain`), which is a visible, harmless outcome rather than a broken page.
 */
export const SESSION_PHOTO_THUMB_ASPECT_LIMIT = 4;

/**
 * The width a thumbnail's box takes at a given height, from the stored
 * dimensions.
 *
 * Rounded to a whole pixel, so the number in the markup is the number the
 * browser lays out; the ≤0.5 px the rounding costs is absorbed by drawing the
 * picture `contain` inside its box, which turns a sub-pixel disagreement into a
 * sub-pixel letterbox instead of a sub-pixel crop.
 *
 * **Nonsense in, a square out.** A zero or negative height, or anything not
 * finite, cannot produce a ratio — and a `NaN` reaching a `width` attribute is
 * how a whole row disappears. The dimensions are checked at the route and again
 * by a CHECK, so this branch should be unreachable; it is here because the cost
 * of being wrong about that is a blank feed.
 */
export function sessionThumbnailWidth(
  width: number,
  height: number,
  thumbHeight: number = SESSION_PHOTO_THUMB_HEIGHT,
): number {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return Math.round(thumbHeight);
  }
  const ratio = Math.min(
    Math.max(width / height, 1 / SESSION_PHOTO_THUMB_ASPECT_LIMIT),
    SESSION_PHOTO_THUMB_ASPECT_LIMIT,
  );
  return Math.max(1, Math.round(thumbHeight * ratio));
}
