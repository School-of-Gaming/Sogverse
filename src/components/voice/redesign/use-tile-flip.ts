import { useLayoutEffect, useRef, type RefObject } from "react";

const FLIP_MS = 250;
const FLIP_EASING = "ease-out";

interface TileBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Glides stage tiles to their new places when the arrangement changes, and
 * fades a newcomer in.
 *
 * **A person joining or a share starting moves tiles somebody may be looking
 * at, on the room's schedule rather than theirs.** That reflow cannot be
 * avoided, because a stage that fills its space has to resize, so it is
 * softened: each surviving tile is measured, drawn at its old box and animated
 * to the new one. Tiles are read through their offsets, which ignore a running
 * transform, so a re-render mid-glide does not restart it.
 *
 * `arrangement` names what the tiles are and how they are laid out. A commit
 * that keeps it, such as a window being resized, updates the boxes and animates
 * nothing, because a tile trailing the edge of a window being dragged is motion
 * nobody asked for. Tiles are the descendants carrying `data-tile-id`, and
 * their offset parent has to be the same element throughout.
 */
export function useTileFlip(
  containerRef: RefObject<HTMLElement | null>,
  arrangement: string,
) {
  const boxes = useRef(new Map<string, TileBox>());
  const lastArrangement = useRef<string | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const changed = lastArrangement.current !== arrangement;
    const firstPass = lastArrangement.current === null;
    lastArrangement.current = arrangement;
    const animate =
      changed &&
      !firstPass &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const next = new Map<string, TileBox>();
    container.querySelectorAll<HTMLElement>("[data-tile-id]").forEach((tile) => {
      const id = tile.dataset.tileId;
      if (id === undefined) return;
      const box: TileBox = {
        left: tile.offsetLeft,
        top: tile.offsetTop,
        width: tile.offsetWidth,
        height: tile.offsetHeight,
      };
      next.set(id, box);
      if (!animate) return;

      const previous = boxes.current.get(id);
      if (previous === undefined) {
        tile.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: FLIP_MS,
          easing: FLIP_EASING,
        });
        return;
      }
      const dx = previous.left - box.left;
      const dy = previous.top - box.top;
      const sx = previous.width / box.width;
      const sy = previous.height / box.height;
      if (dx === 0 && dy === 0 && sx === 1 && sy === 1) return;
      tile.animate(
        [
          {
            transformOrigin: "top left",
            transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
          },
          { transformOrigin: "top left", transform: "none" },
        ],
        { duration: FLIP_MS, easing: FLIP_EASING },
      );
    });
    boxes.current = next;
  });
}
