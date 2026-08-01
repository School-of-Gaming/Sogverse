"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Pinning a chosen element to the pixel it was already on while the page around
 * it changes height.
 *
 * The feed changes height in two places where the change happens *outside* what
 * the reader is looking at, and both would otherwise shove the page under them:
 * the future horizon reveals upward (its sessions are inserted above the
 * divider, because global date order is never violated), and an entry's editor
 * collapses on save or cancel (the card loses most of its height under the
 * button that was just clicked). Neither is a scroll the reader asked for, so
 * neither may happen: the fix is to move the scroll position by exactly as much
 * as the geometry moved, in the same frame, so nothing painted appears to move.
 *
 * This is the chat-history pattern, and the shape of it is always the same:
 * measure the anchor's viewport position *before* the state change (in the
 * event handler, while the old layout is still on screen), then correct the
 * scroll *after* the DOM has updated but before the browser paints.
 *
 * **Every geometry change this corrects is instant.** There is no follow-up
 * hold and no animation to chase, and that is a precondition rather than a
 * simplification: a correction that has to re-run every frame against a running
 * transition is the fragile half of this pattern, and the surfaces that use it
 * dropped their transitions precisely so this could stay one pre-paint write.
 */

/** What a compensation resolved to, given how far the page can actually move. */
export interface ScrollCompensation {
  /** Where the window should end up. Never negative. */
  nextScrollY: number;
  /**
   * Pixels of the requested shift the page could not absorb — always zero
   * unless the anchor was asked to move further up than the top of the
   * document. Whatever is left over is a shift the reader will see.
   */
  shortfall: number;
}

/**
 * Where to scroll to hold an anchor still, and how much of that is impossible.
 *
 * **A page cannot scroll above its own top.** Collapsing the future horizon
 * removes height from above the divider, so holding the divider still means
 * giving that height back to the scroll position — and if the feed was already
 * near the top of the document, there is not enough scroll to give. The
 * remainder is a genuine shift, reported rather than hidden: nothing can be done
 * about it, and pretending it did not happen would make the one case that still
 * moves the hardest one to reason about. (The reveal direction never hits this:
 * the document grows by exactly the amount the scroll has to travel.)
 *
 * Pure, because this is the only arithmetic in the anchoring and it is the half
 * worth pinning in a test — the rest is DOM measurement.
 */
export function resolveScrollCompensation(
  currentScrollY: number,
  /** How far the anchor moved down the viewport; negative means it moved up. */
  shiftPx: number,
): ScrollCompensation {
  const requested = currentScrollY + shiftPx;
  const nextScrollY = Math.max(requested, 0);
  return { nextScrollY, shortfall: nextScrollY - requested };
}

interface PendingAnchor {
  element: HTMLElement;
  /** The anchor's viewport top, read before the state change. */
  top: number;
}

export interface ViewportAnchor {
  /**
   * Remember where `element` currently sits, so the next render can put it back
   * there. Call this **synchronously in the event handler, before** the state
   * update that changes the layout — once React has re-rendered, the position
   * being anchored to is already gone.
   *
   * A `null` element is a no-op, which is the honest answer when there is
   * nothing below the change to hold still.
   */
  capture: (element: HTMLElement | null) => void;
}

/**
 * Hold one element still across a layout change the reader did not ask for.
 *
 * The correction runs in a layout effect — after React has written the DOM,
 * before the browser paints — so the anchored element is never drawn in the
 * wrong place for even one frame. Because the geometry it corrects is always
 * final by then, one write is enough.
 */
export function useViewportAnchor(): ViewportAnchor {
  const pending = useRef<PendingAnchor | null>(null);

  const capture = useCallback((element: HTMLElement | null) => {
    if (element === null) return;
    pending.current = {
      element,
      top: element.getBoundingClientRect().top,
    };
  }, []);

  // No dependency array: a capture can precede any state change, so the
  // correction has to be checked for after every render. It is a ref read and
  // an early return when there is nothing pending.
  useLayoutEffect(() => {
    const anchor = pending.current;
    if (anchor === null) return;
    pending.current = null;

    const shift = anchor.element.getBoundingClientRect().top - anchor.top;
    if (shift === 0) return;
    const { nextScrollY } = resolveScrollCompensation(window.scrollY, shift);
    // `instant`, never smooth: this is a correction for a movement that must
    // never be seen, not a navigation the reader should watch happen.
    window.scrollTo({ top: nextScrollY, behavior: "instant" });
  });

  return { capture };
}
