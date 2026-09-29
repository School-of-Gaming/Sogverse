"use client";

import { useEffect, useRef, useState } from "react";

/** What the guard holds back while it asks. */
type HeldLeave =
  /** A click on a link to another page of the app. */
  | { kind: "link"; anchor: HTMLAnchorElement }
  /** Back or Forward, already undone: `delta` is the step to take again. */
  | { kind: "traverse"; delta: number };

export interface LeaveGuard {
  /** A leave is being held back, waiting for the person's answer. */
  asking: boolean;
  /** Stay on the page; the held leave is dropped. */
  stay: () => void;
  /** Go where the held leave was going. */
  leave: () => void;
}

/**
 * **Asks before a page with unsaved work is left**, while `active` is true.
 *
 * Three ways out are covered, and they need two different answers:
 *
 * - **Reload, close, a typed address, a link to another site**: the page is
 *   unloading, and only the browser's own prompt can stop that. Its wording is
 *   the browser's and cannot be changed.
 * - **A link to another page of the app** (a back link, the sidebar): the click
 *   is caught on its way down, before the link's own handler sees it, and held.
 *   Leaving replays the click on the same link, so the app navigates exactly as
 *   it would have.
 * - **Back and Forward**: the history has already moved when the browser says
 *   so, so the step is taken back before the router hears of it, and held.
 *   Leaving takes it again.
 *
 * The two held kinds are for the caller to ask about, in its own dialog:
 * `asking` opens it, and its answers are `stay` and `leave`.
 *
 * **What the page does itself is never caught**: a save that moves to another
 * route, a replace, a push from code. Only the person's own ways out are.
 * Links that open elsewhere (a new tab, a download, a modified click) and links
 * inside editable content are left alone.
 */
export function useLeaveGuard(active: boolean): LeaveGuard {
  const [held, setHeld] = useState<HeldLeave | null>(null);
  // Set when the person has answered "leave", so the leave replayed below
  // passes the listeners that caught it. The page is going; the latch is
  // cleared only if the guard is armed afresh.
  const leaving = useRef(false);

  useEffect(() => {
    if (!active) return;
    leaving.current = false;

    // Where this page sits in the history, to tell Back from Forward and to
    // recognise the step that undoes one.
    const ownIndex = historyIndex();
    const ownHref = window.location.href;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leaving.current) return;
      event.preventDefault();
    };

    const onClick = (event: MouseEvent) => {
      if (leaving.current) return;
      const anchor = inAppLeave(event);
      if (anchor === null) return;
      event.preventDefault();
      event.stopPropagation();
      setHeld({ kind: "link", anchor });
    };

    // Registered in the capture phase on the window: at the event's own
    // target, capture listeners run before the router's, so stopping it here
    // keeps the router from ever rendering the page the history moved to.
    const onPopState = (event: PopStateEvent) => {
      if (leaving.current) return;
      const index = historyIndex();
      const home =
        ownIndex !== null && index !== null
          ? index === ownIndex
          : window.location.href === ownHref;
      // Back on this page's own entry: the undo below landing, or a step
      // within the page. The router has nothing to do for either.
      event.stopImmediatePropagation();
      if (home) return;
      // Without the Navigation API's index there is no telling the two
      // apart, and Back is the one a person reaches for.
      const delta = ownIndex !== null && index !== null ? ownIndex - index : 1;
      window.history.go(delta);
      setHeld({ kind: "traverse", delta: -delta });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState, true);
    };
  }, [active]);

  return {
    asking: active && held !== null,
    stay: () => setHeld(null),
    leave: () => {
      if (held === null) return;
      leaving.current = true;
      setHeld(null);
      if (held.kind === "traverse") {
        window.history.go(held.delta);
      } else if (held.anchor.isConnected) {
        held.anchor.click();
      } else {
        window.location.assign(held.anchor.href);
      }
    },
  };
}

/**
 * The link a click would leave this page of the app through, or `null` for a
 * click that is not one: not a plain primary click, a link that opens
 * elsewhere, one to another site (the unload prompt covers that), one to a
 * place on this same page, or one inside editable content.
 */
function inAppLeave(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return null;
  }
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.target !== "" && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download") || anchor.isContentEditable) return null;

  const to = new URL(anchor.href);
  const here = new URL(window.location.href);
  if (to.origin !== here.origin) return null;
  if (to.pathname === here.pathname && to.search === here.search) return null;
  return anchor;
}

/**
 * This entry's position in the session history, where the browser has the
 * Navigation API to say it (the DOM typings do not carry it yet).
 */
function historyIndex(): number | null {
  const navigation: unknown = Reflect.get(window, "navigation");
  if (typeof navigation !== "object" || navigation === null) return null;
  if (!("currentEntry" in navigation)) return null;
  const entry = navigation.currentEntry;
  if (typeof entry !== "object" || entry === null || !("index" in entry)) {
    return null;
  }
  return typeof entry.index === "number" ? entry.index : null;
}
