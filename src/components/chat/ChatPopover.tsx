"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** How far the overlay stands off its trigger, and off the viewport edge. */
const GAP_PX = 8;

/**
 * A small overlay anchored to the control that opened it.
 *
 * **Portalled and fixed, because the message log is a scroll region.** Every
 * menu and reaction picker in this feature is summoned from inside a box with
 * `overflow-y-auto`, and an absolutely-positioned child of that box is clipped
 * by it — a menu on the log's last message would be half a menu. So the overlay
 * renders into `document.body` at coordinates read off the trigger, which is a
 * measurement taken at open time, in a handler, on a user's own gesture: the
 * one moment measuring is free of the layout rule.
 *
 * **It closes on a scroll rather than following one.** Following would mean
 * re-measuring every frame of a scroll the user started in order to get *away*
 * from the thing they opened; closing is what they meant.
 *
 * **It opens upward, and flips below when there is not room to.** The trigger is
 * a bubble's top-right corner, so upward is what keeps the menu off the message
 * it is about — but the first message in a log sits near the top of the window,
 * and an overlay hung above *that* one is drawn off the top of the viewport
 * where no clamp can retrieve it: pinning its top edge on screen while it is
 * still translated up by its own height moves it further out, not less. So the
 * height is measured once, before the browser paints, and the side is chosen
 * from it.
 *
 * Not built on `Dialog`: this is a popover, not a modal — it takes no focus
 * trap, dims nothing, and several of them opening in sequence must not stack.
 * What it does borrow is Dialog's own reason for existing: exactly one answer to
 * the portal, so no surface rolls its own.
 */
export function ChatPopover({
  anchor,
  onClose,
  children,
}: {
  /** The element the overlay hangs off — typically the button that opened it. */
  anchor: HTMLElement | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [below, setBelow] = useState(false);

  // Measured during render rather than held in state: this component only
  // exists while the overlay is up, the anchor is already on screen, and a
  // scroll or a resize closes rather than re-measures — so there is exactly
  // one measurement per opening either way, and state would only add a frame
  // in which the overlay is mounted with nowhere to be.
  const rect = anchor === null ? null : anchor.getBoundingClientRect();

  // A *layout* effect, so the side is settled before the first paint: the
  // overlay is never seen in the place it would not have fitted. The overlay's
  // own height is the one number no arithmetic off the trigger can supply, and
  // it does not change while the overlay is up — a scroll or a resize closes it.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (anchor === null || box === null) return;
    const spaceAbove = anchor.getBoundingClientRect().top - GAP_PX;
    setBelow(spaceAbove < box.offsetHeight);
  }, [anchor]);

  useEffect(() => {
    if (anchor === null) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (boxRef.current?.contains(target) === true) return;
      if (anchor.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // Capture, so a scroll inside the log reaches this before the log's own
    // handler — the overlay has to go the moment the thing it points at moves.
    const onScroll = () => onClose();

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [anchor, onClose]);

  if (anchor === null || rect === null) return null;

  return createPortal(
    <div
      ref={boxRef}
      // Right-aligned to the trigger either way; above it by preference, below
      // it when above would not fit.
      style={{
        position: "fixed",
        top: below ? rect.bottom + GAP_PX : Math.max(GAP_PX, rect.top - GAP_PX),
        right: Math.max(GAP_PX, window.innerWidth - rect.right),
        transform: below ? undefined : "translateY(-100%)",
      }}
      className="z-50"
    >
      {children}
    </div>,
    document.body,
  );
}
