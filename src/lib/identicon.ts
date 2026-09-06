import { IDENTICON, type IdenticonColourId } from "@sog/ui";

/**
 * The library's four, split by id.
 *
 * A colour is read by its id and never by its hue. The four are "the colours
 * valid for an identicon" and nothing more; which of them a cell gets is decided
 * by a byte of the person's id, and this file has no opinion about it. All the
 * split says is that one of the four is the ground the face sits on and the
 * other three are what its cells are drawn from.
 */
const GROUND_ID = 3 satisfies IdenticonColourId;

/** The ground, for the renderer that draws the square behind the cells. */
const [GROUND] = IDENTICON.filter((colour) => colour.id === GROUND_ID);
export const IDENTICON_GROUND = GROUND.hex;

/**
 * The three a cell may take, in the library's order.
 *
 * The order and the length are the face itself — a cell's colour is a byte
 * modulo this array's length — so adding, removing or reordering an entry
 * redraws every person's avatar.
 */
const COLORS = IDENTICON.filter((colour) => colour.id !== GROUND_ID).map(
  (colour) => colour.hex,
);

export interface IdenticonData {
  grid: boolean[][];
  colors: string[][];
}

export function generateIdenticon(id: string): IdenticonData {
  // Strip dashes from UUID and parse hex values
  const hex = id.replace(/-/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }

  // Use first 2 bytes (16 bits): 15 bits for grid
  // Build a 5x3 half-grid (5 rows x 3 columns), then mirror for symmetry
  const bits = (bytes[0] << 8) | (bytes[1] ?? 0);

  const halfGrid: boolean[][] = [];
  const halfColors: string[][] = [];
  for (let row = 0; row < 5; row++) {
    halfGrid[row] = [];
    halfColors[row] = [];
    for (let col = 0; col < 3; col++) {
      const cellIndex = row * 3 + col;
      halfGrid[row][col] = ((bits >> cellIndex) & 1) === 1;
      // Pick per-cell color from remaining bytes (wrap around if needed)
      halfColors[row][col] = COLORS[bytes[(2 + cellIndex) % bytes.length] % COLORS.length];
    }
  }

  // Mirror to full 5x5 grid: col 3 = col 1, col 4 = col 0
  const grid: boolean[][] = [];
  const colors: string[][] = [];
  for (let row = 0; row < 5; row++) {
    grid[row] = [
      halfGrid[row][0],
      halfGrid[row][1],
      halfGrid[row][2],
      halfGrid[row][1],
      halfGrid[row][0],
    ];
    colors[row] = [
      halfColors[row][0],
      halfColors[row][1],
      halfColors[row][2],
      halfColors[row][1],
      halfColors[row][0],
    ];
  }

  return { grid, colors };
}
