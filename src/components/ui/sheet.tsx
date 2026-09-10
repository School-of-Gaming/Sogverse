"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * How long the scrim's fade and the panel's slide take, in milliseconds. It is
 * the number `duration-200` spells on both of them below, and the two have to
 * move together: the wait for a close to finish is timed from it.
 */
const SLIDE_MS = 200;

/**
 * How long a close waits for the panel to report the end of its slide before
 * taking it as finished anyway. A tab in the background, or a panel that never
 * moved, sends no `transitionend` at all. The margin past the slide is because
 * the slide starts on the frame after the close rather than on the close
 * itself, so a timer of exactly its length would fire while the last of the
 * panel is still on screen; with the margin, the event wins whenever the
 * browser is going to send one.
 */
const EXIT_FALLBACK_MS = SLIDE_MS + 100;

/**
 * The properties a panel's slide animates. Tailwind's translate utilities set
 * the standalone `translate` property; `transform` is here so a slide written
 * the older way is still recognised as one.
 */
const SLIDE_PROPERTIES = new Set(["translate", "transform"]);

const subscribeToNothing = () => () => {};

/**
 * Whether this render is in a browser. A server render, and the hydration
 * render that has to agree with it, read false; every client render after that
 * reads true. It is an external store rather than a flag set in an effect so
 * that the switch is React's own re-render after hydration, not a state update
 * the component schedules on itself.
 */
function useIsClient() {
  return React.useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Which edge the panel comes in from. `right` is the desk drawer every
   * staff surface uses — a picker beside the table it is picking for.
   * `bottom` is the phone shape: the panel meets the thumb that summoned it,
   * and it is capped short of the top so the page it belongs to stays visible
   * behind it. A sheet from the bottom on a wide screen would be a drawer
   * across a monitor, so `bottom` exists for surfaces that only open it on a
   * narrow viewport.
   */
  side?: "right" | "bottom";
  /**
   * Called when a close has finished — the panel has slid off the screen, so
   * whatever it holds can go without anyone watching it leave. Once per close;
   * never for a sheet that mounted closed, and not at all for a close that a
   * reopening interrupted. Pass a stable function: a new one on every render
   * restarts the wait.
   */
  onExitComplete?: () => void;
  children: React.ReactNode;
}

/**
 * A panel over the page, meant to stay mounted and be opened and closed by
 * `open` — that is what lets it slide in and out rather than appear and
 * vanish. It renders nothing on the server, which has no `document.body` to
 * portal into, and arrives on the client once hydration has agreed with that.
 */
function Sheet({
  open,
  onOpenChange,
  side = "right",
  onExitComplete,
  children,
}: SheetProps) {
  const isClient = useIsClient();
  const scrimRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const settledPanel = React.useRef<HTMLDivElement | null>(null);
  const hasOpened = React.useRef(false);

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  // Prevent body scroll while open. Keyed on `open` rather than on being
  // mounted, so a sheet that stays on the page hands the scroll back the
  // moment it closes, not when its slide ends.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // A transition runs from the style the browser last computed for an element
  // to the one it computes next. A panel that is inserted and opened before
  // the browser has computed anything for it has no "before" to run from, and
  // is simply drawn open. Staying mounted closed is what normally avoids that,
  // but the portal only exists from the render after hydration, and an update
  // that opens the sheet can land in that same render or the same task — a tap
  // during hydration is replayed as soon as hydration completes. So the first
  // time a panel is in the document, its closed position is computed on the
  // spot: pinned there first if it arrived already open, then released to its
  // classes, which the browser then sees as a change to slide through.
  React.useLayoutEffect(() => {
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    if (!isClient || !panel || !scrim || settledPanel.current === panel) return;
    settledPanel.current = panel;
    if (open) {
      panel.style.setProperty("translate", side === "bottom" ? "0 100%" : "100% 0");
      scrim.style.setProperty("opacity", "0");
    }
    // Reading geometry makes the browser compute the panel's style now.
    panel.getBoundingClientRect();
    panel.style.removeProperty("translate");
    scrim.style.removeProperty("opacity");
  }, [isClient, open, side]);

  // A close is finished when the panel's own slide ends — not a transition on
  // something inside it, which bubbles here too, and not the scrim's fade.
  // Reopening before then tears the wait down, so a stale end never reaches a
  // sheet that is open again.
  React.useEffect(() => {
    if (open) {
      hasOpened.current = true;
      return;
    }
    if (!hasOpened.current || !onExitComplete) return;
    const panel = panelRef.current;
    let reported = false;
    const report = () => {
      if (reported) return;
      reported = true;
      onExitComplete();
    };
    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.target === panel && SLIDE_PROPERTIES.has(event.propertyName)) {
        report();
      }
    };
    panel?.addEventListener("transitionend", handleTransitionEnd);
    const fallback = window.setTimeout(report, EXIT_FALLBACK_MS);
    return () => {
      panel?.removeEventListener("transitionend", handleTransitionEnd);
      window.clearTimeout(fallback);
    };
  }, [open, onExitComplete]);

  if (!isClient) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
      // A sheet is a portal, so a `<form>` inside one submits the form it was
      // *opened from* rather than nothing at all — React dispatches on the tree
      // it rendered. `Dialog` carries the same line, and the paragraph
      // explaining it. No sheet holds a form today; the containment is here
      // because the first one to do so would have no warning that it needed it.
      onSubmit={(event) => event.stopPropagation()}
    >
      {/* The fade and the slide are deliberately not switched off for a
          reader who prefers reduced motion. They are not decoration: the
          slide is what shows where the panel came from and where it has gone
          back to, and a panel that appears over the page with no origin is
          harder to follow, not calmer. A sweep adding reduced-motion variants
          here would be taking that away. */}
      <div
        ref={scrimRef}
        className={cn(
          "fixed inset-0 bg-scrim transition-opacity duration-200 ease-out",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={panelRef}
        className={cn(
          "fixed z-50 bg-card shadow-xl transition-transform duration-200 ease-out",
          side === "right" &&
            "inset-y-0 right-0 w-full max-w-md border-l border-border sm:max-w-lg",
          side === "right" && (open ? "translate-x-0" : "translate-x-full"),
          // It is as tall as what it holds. Where that could outgrow the
          // screen, the body caps itself and scrolls — which is the caller's
          // call, since only the caller knows how much of the page behind
          // should stay visible above it.
          //
          // The bottom padding keeps the panel's last row clear of a phone's
          // home indicator, and it belongs here because every sheet from the
          // bottom meets that edge. It resolves to nothing until the page's
          // viewport opts into drawing under the device's insets
          // (`viewport-fit=cover`), which this app's does not today; it is
          // written anyway so that change finds this edge already right.
          side === "bottom" &&
            "inset-x-0 bottom-0 rounded-t-xl border-t border-border pb-[env(safe-area-inset-bottom)]",
          side === "bottom" && (open ? "translate-y-0" : "translate-y-full"),
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function SheetContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex h-full flex-col", className)}
      {...props}
    >
      {children}
    </div>
  );
}

function SheetHeader({
  className,
  onClose,
  actions,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  onClose?: () => void;
  /**
   * Controls that act on the sheet as a whole, set at the end of the header
   * just before Close. They share Close's group, packed to the end, so a
   * control that appears only once there is something for it to do grows the
   * group leftward into the header's slack: the title at the start and Close
   * at the end keep their places, and nothing below the header moves. Handed
   * in as children instead, a control lands in the title's column — a line of
   * its own under the title, which costs the sheet's body that much height.
   */
  actions?: React.ReactNode;
}) {
  const c = useTranslations('common');
  return (
    <div
      className={cn(
        "flex items-start justify-between border-b border-border px-6 py-5",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col space-y-1.5">{children}</div>
      {(actions || onClose) && (
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {onClose && (
            <button
              onClick={onClose}
              aria-label={c('close')}
              className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SheetTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function SheetBody({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex-1 overflow-y-auto px-6 py-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody };
