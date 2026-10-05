import { G, Path, Polygon, Rect, Svg } from "@react-pdf/renderer";
import {
  SOG_MARK_BADGE,
  SOG_MARK_FILL,
  SOG_MARK_MONOGRAM_PATHS,
  SOG_MARK_NAME_PATHS,
  SOG_MARK_NAME_POLYGONS,
  SOG_MARK_NAME_RECT,
  SOG_MARK_VIEW_BOX,
  SOG_MARK_VIEW_HEIGHT,
  SOG_MARK_VIEW_WIDTH,
} from "@/components/brand/sog-mark-geometry";

/**
 * School of Gaming's full mark — the amber badge with "SCHOOL OF GAMING"
 * beneath the monogram — drawn as react-pdf vector primitives for the gedu's
 * work statement.
 *
 * react-pdf cannot import an `.svg` and draws only its own primitives, so this
 * maps over the mark's geometry in `src/components/brand/sog-mark-geometry.ts`,
 * the one copy the Open Graph cards' `SogMark` draws from too.
 *
 * The default colourway is the one for white paper, and the mark is never
 * recoloured, so this takes a height and nothing else; the width follows the
 * viewBox so it can never be scaled unevenly.
 */
export function SogPdfMark({ height }: { height: number }) {
  return (
    <Svg
      width={height * (SOG_MARK_VIEW_WIDTH / SOG_MARK_VIEW_HEIGHT)}
      height={height}
      viewBox={SOG_MARK_VIEW_BOX}
    >
      <Path d={SOG_MARK_BADGE} fill={SOG_MARK_FILL.badge} />
      <G fill={SOG_MARK_FILL.lettering}>
        {[...SOG_MARK_MONOGRAM_PATHS, ...SOG_MARK_NAME_PATHS].map((d) => (
          <Path key={d} d={d} />
        ))}
        {SOG_MARK_NAME_POLYGONS.map((points) => (
          <Polygon key={points} points={points} />
        ))}
        <Rect {...SOG_MARK_NAME_RECT} />
      </G>
    </Svg>
  );
}
