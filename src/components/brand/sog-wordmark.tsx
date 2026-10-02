import {
  SOG_MARK_NAME_PATHS,
  SOG_MARK_NAME_POLYGONS,
  SOG_MARK_NAME_RECT,
} from "@/components/brand/sog-mark-geometry";

/**
 * "SCHOOL OF GAMING" set in the mark's own letterforms.
 *
 * It holds no glyphs of its own: it draws the name line of the full mark from
 * `sog-mark-geometry.ts`, the one code-format version of
 * `src/assets/brand/sog-logo-full.svg`, which a unit test holds to that file. The
 * only thing it adds is the `viewBox`, cropped to the name line's band (y
 * 124.3-152.5 of the mark's 379x207.5 box) rather than the whole mark, so the
 * header's wordmark cannot drift from the artwork.
 *
 * It exists as inline SVG rather than as a file behind `next/image` for one
 * reason: `fill="currentColor"` lets it take its colour from CSS like any other
 * text, which an `<img>` cannot do.
 *
 * The header sets the brand name beside the badge as artwork rather than as HTML
 * text because the full mark's own version of this line renders around 6px tall
 * at any height a 64px header strip allows — too small to read. Set from these
 * paths at 15px it is the mark's own lettering, crisp at any size.
 */

/** The band's tight bounding box in the full mark's own coordinate system. */
const VIEW_BOX = "74.8 124.3 231.2 28.2";

/** Width per unit of height, from that box — not an eyeballed number. */
const ASPECT_RATIO = 231.2 / 28.2;

export function SogWordmark({
  height = 15,
  className,
}: {
  /** Rendered height in CSS pixels; the width follows from the real ratio. */
  height?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox={VIEW_BOX}
      width={Math.round(height * ASPECT_RATIO * 100) / 100}
      height={height}
      fill="currentColor"
      // The link this sits inside carries the brand name as its `aria-label`
      // (the badge beside it is decorative, with an empty `alt`), so a screen
      // reader announcing the name twice inside one link would be noise.
      aria-hidden
      focusable="false"
      className={className}
    >
      {SOG_MARK_NAME_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
      {SOG_MARK_NAME_POLYGONS.map((points) => (
        <polygon key={points} points={points} />
      ))}
      <rect {...SOG_MARK_NAME_RECT} />
    </svg>
  );
}
