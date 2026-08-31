"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

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

  // Measured during render rather than held in state: this component only
  // exists while the overlay is up, the anchor is already on screen, and a
  // scroll or a resize closes rather than re-measures — so there is exactly
  // one measurement per opening either way, and state would only add a frame
  // in which the overlay is mounted with nowhere to be.
  const rect = anchor === null ? null : anchor.getBoundingClientRect();

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
      // Right-aligned to the trigger and sitting above it: the trigger is at a
      // bubble's top-right corner, so opening upward keeps the menu off the
      // message it is about.
      style={{
        position: "fixed",
        top: Math.max(8, rect.top - 8),
        right: Math.max(8, window.innerWidth - rect.right),
        transform: "translateY(-100%)",
      }}
      className="z-50"
    >
      {children}
    </div>,
    document.body,
  );
}
