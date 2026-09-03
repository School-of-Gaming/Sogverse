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
 * **Right-aligned to the trigger, and then pushed back inside whichever edge it
 * escaped.** Alignment is a preference, not a position: a trigger near the left
 * of the window — the action bar over a small thumbnail at the start of a
 * picture run is the case that found this — hangs a right-aligned overlay off
 * the left of the screen, where half a reaction picker is unreachable and no
 * scroll retrieves it, because the overlay is `fixed`. So both axes are
 * measured against the viewport and clamped to a margin inside it, and the box
 * is capped at the viewport's own width so a long menu label at the narrow
 * floor cannot make a box no clamp can fit.
 *
 * **All of that happens once, at open time**, in the same measurement the flip
 * already took — this overlay closes on a scroll rather than following one, so
 * there is no second position to compute and nothing to keep in step.
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
  const [placement, setPlacement] = useState<ChatPopoverPlacement | null>(null);

  // A *layout* effect, so the position is settled before the first paint: the
  // overlay is never seen anywhere but where it belongs. The overlay's own size
  // is the pair of numbers no arithmetic off the trigger can supply — which is
  // why this cannot be computed during render — and neither number changes
  // while the overlay is up, because a scroll or a resize closes it.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (anchor === null || box === null) return;
    setPlacement(
      placeChatPopover(
        anchor.getBoundingClientRect(),
        { width: box.offsetWidth, height: box.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
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

  if (anchor === null) return null;

  return createPortal(
    <div
      ref={boxRef}
      style={{
        position: "fixed",
        top: placement?.top ?? 0,
        left: placement?.left ?? 0,
        // The cap the clamp needs to be able to succeed: a box wider than the
        // window has no position that fits, and it is reachable at the 360px
        // floor by a menu whose longest item is a French lock label.
        maxWidth: `calc(100vw - ${String(GAP_PX * 2)}px)`,
        // One render exists before the size is known — the render the size is
        // measured *from*. It is never painted (the layout effect below it
        // commits first), and hiding it says so outright rather than resting on
        // that ordering.
        visibility: placement === null ? "hidden" : undefined,
      }}
      className="z-50"
    >
      {children}
    </div>,
    document.body,
  );
}

/** Where an overlay of this size goes, given its trigger and the window. */
export interface ChatPopoverPlacement {
  top: number;
  left: number;
}

/**
 * The arithmetic, apart from the DOM so it can be reasoned about and tested.
 *
 * Right-aligned to the trigger and above it by preference; below when above
 * would not fit; and on both axes pushed back inside the viewport's margin
 * whenever the preference would have put it outside. A box too big for the
 * window at all is pinned to the near edge and allowed to overflow the far one,
 * which is the readable half — an overlay clipped at its top or its start edge
 * is one whose first line and first control are the ones you cannot reach.
 */
export function placeChatPopover(
  trigger: { top: number; bottom: number; right: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): ChatPopoverPlacement {
  const above = trigger.top - GAP_PX - size.height;
  return {
    left: clampWithin(trigger.right - size.width, size.width, viewport.width),
    top:
      above >= GAP_PX
        ? above
        : clampWithin(trigger.bottom + GAP_PX, size.height, viewport.height),
  };
}

/** Keep a run of `length` starting at `start` inside `extent`'s own margins. */
function clampWithin(start: number, length: number, extent: number): number {
  return Math.max(GAP_PX, Math.min(start, extent - GAP_PX - length));
}
