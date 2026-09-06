import { memo } from "react";
import { generateIdenticon, IDENTICON_GROUND } from "@/lib/identicon";
import { cn } from "@/lib/utils";
interface IdenticonProps {
  id: string;
  size?: number;
  className?: string;
}

const CELL_COUNT = 5;

export const Identicon = memo(function Identicon({ id, size = 40, className }: IdenticonProps) {
  const { grid, colors } = generateIdenticon(id);
  const cellSize = size / CELL_COUNT;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("absolute inset-0 h-full w-full", className)}
      role="img"
      aria-label="User avatar"
    >
      <rect width={size} height={size} fill={IDENTICON_GROUND} />
      {grid.map((row, rowIdx) =>
        row.map(
          (active, colIdx) =>
            active && (
              <rect
                key={`${rowIdx}-${colIdx}`}
                x={colIdx * cellSize}
                y={rowIdx * cellSize}
                width={cellSize}
                height={cellSize}
                fill={colors[rowIdx][colIdx]}
              />
            )
        )
      )}
    </svg>
  );
});
