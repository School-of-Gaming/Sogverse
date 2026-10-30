import { describe, expect, it } from "vitest";
import { fitTileGrid, TILE_GAP_PX } from "@/components/voice/redesign/fit-tile-grid";

const desktop = { width: 1400, height: 760, aspect: 16 / 9, minTileWidth: 200 };

describe("fitTileGrid", () => {
  it.each([
    [1, 1],
    [2, 2],
    [4, 2],
    [6, 3],
    [9, 3],
  ])("arranges %i people on a wide stage in %i columns", (count, columns) => {
    expect(fitTileGrid({ ...desktop, count })).toMatchObject({ columns, scrolls: false });
  });

  it("stacks two people on a tall stage", () => {
    const grid = fitTileGrid({
      count: 2,
      width: 344,
      height: 560,
      aspect: 1,
      minTileWidth: 150,
    });
    expect(grid.columns).toBe(1);
  });

  it("never lets a row of tiles run past the width", () => {
    for (let count = 1; count <= 30; count++) {
      const { columns, tileWidth } = fitTileGrid({ ...desktop, count });
      expect(columns * tileWidth + (columns - 1) * TILE_GAP_PX).toBeLessThanOrEqual(
        desktop.width,
      );
    }
  });

  it("stops shrinking at the floor and scrolls instead", () => {
    const grid = fitTileGrid({ ...desktop, count: 40 });
    expect(grid.scrolls).toBe(true);
    expect(grid.tileWidth).toBeGreaterThanOrEqual(desktop.minTileWidth);
  });
});
