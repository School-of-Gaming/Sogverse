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

/**
 * Where to scroll to hold an anchor still — clamped at the top of the document,
 * which is the one place the correction cannot be paid in full.
 *
 * **A page cannot scroll above its own top.** Collapsing the future horizon
 * removes height from above the divider, so holding the divider still means
 * giving that height back to the scroll position — and if the feed was already
 * near the top of the document, there is not enough scroll to give. Whatever is
 * left over is a genuine shift the reader will see, and there is nothing this or
 * any other code can do about it; the honest thing is to name the case rather
 * than to report a number nobody can act on. (The reveal direction never hits
 * this: the document grows by exactly the amount the scroll has to travel.)
 *
 * Pure and returning one number, because this is the only arithmetic in the
 * anchoring and it is the half worth pinning in a test — the rest is DOM
 * measurement.
 */
export function resolveScrollCompensation(
  currentScrollY: number,
  /** How far the anchor moved down the viewport; negative means it moved up. */
  shiftPx: number,
): number {
  return Math.max(currentScrollY + shiftPx, 0);
}

/**
 * Which element holds still when an entry's editor is toggled — and it is not
 * the same element in both directions.
 *
 * **Closing anchors the row *below* the edited one.** The card loses most of its
 * height in one frame and the reader's eye has already moved on to what comes
 * next: the entry they are about to write up, or the week before the one they
 * just finished. Holding the edited card's own top edge instead kept its header
 * still and swept everything under it up the screen, which is precisely the half
 * of the page somebody who just saved is reading. A last row has no sibling and
 * gets no compensation, which is the honest answer — there is nothing below it
 * to hold.
 *
 * **Opening anchors the clicked row itself.** Only one editor is open at a time,
 * so opening entry A implicitly closes whatever B was open; if B sat above A,
 * B's whole height vanishes from above the click target and A slides up the
 * viewport with the cursor still where it was. Holding A's own row covers that
 * and costs nothing in the ordinary case, where nothing was open and A's top
 * edge does not move at all — the expansion grows downward *inside* the row.
 */
export function editToggleAnchor(
  rows: ReadonlyMap<string, HTMLElement>,
  entryId: string,
  /** Whether this toggle is shutting the entry's editor rather than opening it. */
  closing: boolean,
): HTMLElement | null {
  const row = rows.get(entryId) ?? null;
  if (row === null || !closing) return row;
  const next = row.nextElementSibling;
  return next instanceof HTMLElement ? next : null;
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
    const nextScrollY = resolveScrollCompensation(window.scrollY, shift);
    // `instant`, never smooth: this is a correction for a movement that must
    // never be seen, not a navigation the reader should watch happen.
    window.scrollTo({ top: nextScrollY, behavior: "instant" });
  });

  return { capture };
}
