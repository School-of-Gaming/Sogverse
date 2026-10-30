/** The gap between stage tiles, in pixels: the stage's `gap-2`. */
export const TILE_GAP_PX = 8;

/** The shapes a tile may take, as width over height. */
export interface TileAspectRange {
  min: number;
  max: number;
}

export interface TileGridInput {
  /** How many tiles the stage holds. */
  count: number;
  /** The space the tiles may fill, in pixels. */
  width: number;
  height: number;
  aspect: TileAspectRange;
  /** The narrowest a tile may get before the stage scrolls instead. */
  minTileWidth: number;
}

export interface TileGrid {
  columns: number;
  tileWidth: number;
  tileHeight: number;
  /** The tiles run past the space, so the stage scrolls within itself. */
  scrolls: boolean;
}

/**
 * The biggest tiles that fit: tries every column count and keeps the one whose
 * tile has the most area, so 1, 2, 4, 6 and 9 people each take the arrangement
 * that fills this space rather than a fixed table of shapes.
 *
 * **A tile's shape gives within `aspect`, so the tiles fill the stage instead of
 * leaving bars above and below a fixed shape.** A camera is cropped to its box,
 * so a little give costs an edge of the picture and buys a much bigger face.
 *
 * **Beyond what fits at `minTileWidth`, tiles stop shrinking and the stage
 * scrolls within itself.** A tile too small to recognise a face is the defect
 * this redesign exists to fix, so a crowded zone trades "everyone at once" for
 * legible tiles, at the widest shape so that as many as possible show. The order
 * never depends on who is speaking, so nothing jumps.
 *
 * Sizes are whole pixels, floored, so a row of them cannot round past the width
 * and wrap.
 */
export function fitTileGrid({
  count,
  width,
  height,
  aspect,
  minTileWidth,
}: TileGridInput): TileGrid {
  const tiles = Math.max(count, 1);
  const availableWidth = Math.max(width, 0);
  const availableHeight = Math.max(height, 0);

  let best: TileGrid | null = null;
  let bestArea = 0;
  for (let candidate = 1; candidate <= tiles; candidate++) {
    const rows = Math.ceil(tiles / candidate);
    const widest = (availableWidth - TILE_GAP_PX * (candidate - 1)) / candidate;
    const tallest = (availableHeight - TILE_GAP_PX * (rows - 1)) / rows;
    if (widest <= 0 || tallest <= 0) continue;
    const tileWidth = Math.floor(Math.min(widest, tallest * aspect.max));
    const tileHeight = Math.floor(Math.min(tallest, widest / aspect.min));
    const area = tileWidth * tileHeight;
    if (area > bestArea) {
      bestArea = area;
      best = { columns: candidate, tileWidth, tileHeight, scrolls: false };
    }
  }

  if (best !== null && best.tileWidth >= minTileWidth) return best;

  const scrollingColumns = Math.max(
    Math.floor((availableWidth + TILE_GAP_PX) / (minTileWidth + TILE_GAP_PX)),
    1,
  );
  const scrollingWidth = Math.floor(
    (availableWidth - TILE_GAP_PX * (scrollingColumns - 1)) / scrollingColumns,
  );
  return {
    columns: scrollingColumns,
    tileWidth: scrollingWidth,
    tileHeight: Math.floor(scrollingWidth / aspect.max),
    scrolls: true,
  };
}
