import { BRAND } from "@/lib/constants/colors";

const COLORS = [BRAND.primary, BRAND.secondary, "#FFFFFF"];

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
