/** The gap between stage tiles, in pixels: the stage's `gap-2`. */
export const TILE_GAP_PX = 8;

export interface TileGridInput {
  /** How many tiles the stage holds. */
  count: number;
  /** The space the tiles may fill, in pixels. */
  width: number;
  height: number;
  /** Tile width over tile height. */
  aspect: number;
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
 * tile is widest, so 1, 2, 4, 6 and 9 people each take the arrangement that
 * fills this space rather than a fixed table of shapes.
 *
 * **Beyond what fits at `minTileWidth`, tiles stop shrinking and the stage
 * scrolls within itself.** A tile too small to recognise a face is the defect
 * this redesign exists to fix, so a crowded zone trades "everyone at once" for
 * legible tiles. The order never depends on who is speaking, so nothing jumps.
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
  const available = Math.max(width, 0);

  let columns = 1;
  let tileWidth = 0;
  for (let candidate = 1; candidate <= tiles; candidate++) {
    const rows = Math.ceil(tiles / candidate);
    const widest = (available - TILE_GAP_PX * (candidate - 1)) / candidate;
    const tallest = (height - TILE_GAP_PX * (rows - 1)) / rows;
    const candidateWidth = Math.floor(Math.min(widest, tallest * aspect));
    if (candidateWidth > tileWidth) {
      tileWidth = candidateWidth;
      columns = candidate;
    }
  }

  if (tileWidth >= minTileWidth) {
    return {
      columns,
      tileWidth,
      tileHeight: Math.floor(tileWidth / aspect),
      scrolls: false,
    };
  }

  const scrollingColumns = Math.max(
    Math.floor((available + TILE_GAP_PX) / (minTileWidth + TILE_GAP_PX)),
    1,
  );
  const scrollingWidth = Math.floor(
    (available - TILE_GAP_PX * (scrollingColumns - 1)) / scrollingColumns,
  );
  return {
    columns: scrollingColumns,
    tileWidth: scrollingWidth,
    tileHeight: Math.floor(scrollingWidth / aspect),
    scrolls: true,
  };
}
