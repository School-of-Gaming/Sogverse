"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/**
 * Pinning a chosen element to the pixel it was already on while the page around
 * it changes height.
 *
 * The feed grows and shrinks in two places where the change happens *above* what
 * the reader is looking at, and both would otherwise shove the page under them:
 * the future horizon reveals upward (its sessions are inserted above the divider,
 * because global date order is never violated), and an entry's editor collapses
 * on save (the card shrinks under the button that was just clicked). Neither is
 * a scroll the reader asked for, so neither may happen: the fix is to move the
 * scroll position by exactly as much as the geometry moved, in the same frame,
 * so nothing painted appears to move at all.
 *
 * This is the chat-history pattern, and the shape of it is always the same:
 * measure the anchor's viewport position *before* the state change (in the
 * event handler, while the old layout is still on screen), then correct the
 * scroll *after* the DOM has updated but before the browser paints.
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
  /** How long to keep holding it, for a change that animates its height. */
  holdMs: number;
}

/**
 * How long an anchor captured across an animated collapse keeps correcting.
 *
 * The collapsible regions transition over 200ms, and geometry that is still
 * moving cannot be corrected once — so the hold re-measures every frame until
 * the transition is over, plus a frame of slack.
 *
 * The reveal path passes no hold at all: it does not animate, so a single
 * pre-paint correction is exact. Holding against an animation is the fragile
 * half of this pattern, not something to reach for by default.
 */
export const COLLAPSE_HOLD_MS = 260;

/**
 * Events that mean the reader has taken over. A hold that kept correcting
 * through a deliberate scroll would be the very thing this exists to prevent —
 * the page refusing to go where somebody put it.
 */
const HANDOVER_EVENTS = ["wheel", "touchstart", "keydown"] as const;

export interface ViewportAnchor {
  /**
   * Remember where `element` currently sits, so the next render can put it back
   * there. Call this **synchronously in the event handler, before** the state
   * update that changes the layout — once React has re-rendered, the position
   * being anchored to is already gone.
   *
   * Pass `holdMs` when the change animates its height; leave it off when the
   * new geometry is final by the time the DOM updates.
   */
  capture: (element: HTMLElement | null, options?: { holdMs?: number }) => void;
}

/**
 * Hold one element still across a layout change the reader did not ask for.
 *
 * The correction runs in a layout effect — after React has written the DOM,
 * before the browser paints — so the anchored element is never drawn in the
 * wrong place for even one frame. An animated change gets a short follow-up
 * hold, which stops early the moment the reader scrolls, wheels or types.
 */
export function useViewportAnchor(): ViewportAnchor {
  const pending = useRef<PendingAnchor | null>(null);
  /** Cancels the follow-up hold, when one is running. */
  const releaseHold = useRef<(() => void) | null>(null);

  const capture = useCallback(
    (element: HTMLElement | null, options?: { holdMs?: number }) => {
      if (element === null) return;
      pending.current = {
        element,
        top: element.getBoundingClientRect().top,
        holdMs: options?.holdMs ?? 0,
      };
    },
    [],
  );

  // No dependency array: a capture can precede any state change, so the
  // correction has to be checked for after every render. It is a ref read and
  // an early return when there is nothing pending.
  useLayoutEffect(() => {
    const anchor = pending.current;
    if (anchor === null) return;
    pending.current = null;

    // A second capture while a hold is still running supersedes it — the older
    // anchor is describing a layout that has since changed again.
    releaseHold.current?.();
    releaseHold.current = null;

    correctTo(anchor);
    if (anchor.holdMs > 0) {
      releaseHold.current = holdThroughAnimation(anchor, () => {
        releaseHold.current = null;
      });
    }
  });

  // Deliberately separate from the correction effect, and unmount-only: a hold
  // outlives the render that started it, so tying its teardown to that effect's
  // cleanup would cancel it on the next unrelated re-render.
  useEffect(() => () => releaseHold.current?.(), []);

  return { capture };
}

/** Move the scroll so the anchor sits where it did, as far as the page allows. */
function correctTo(anchor: PendingAnchor): void {
  const shift = anchor.element.getBoundingClientRect().top - anchor.top;
  if (shift === 0) return;
  const { nextScrollY } = resolveScrollCompensation(window.scrollY, shift);
  // `instant`, never smooth: this is a correction for a movement that must
  // never be seen, not a navigation the reader should watch happen.
  window.scrollTo({ top: nextScrollY, behavior: "instant" });
}

/**
 * Keep correcting every frame while an animated height change plays out,
 * until it settles, the reader takes over, or the hold's time is up.
 */
function holdThroughAnimation(
  anchor: PendingAnchor,
  onDone: () => void,
): () => void {
  const deadline = performance.now() + anchor.holdMs;
  let frame = 0;

  const stop = () => {
    cancelAnimationFrame(frame);
    for (const event of HANDOVER_EVENTS) {
      window.removeEventListener(event, stop);
    }
    onDone();
  };

  const tick = () => {
    correctTo(anchor);
    if (performance.now() >= deadline) stop();
    else frame = requestAnimationFrame(tick);
  };

  for (const event of HANDOVER_EVENTS) {
    window.addEventListener(event, stop, { passive: true, once: true });
  }
  frame = requestAnimationFrame(tick);
  return stop;
}
