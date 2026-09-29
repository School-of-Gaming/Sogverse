"use client";

import { useEffect, useRef, useState } from "react";

/** What the guard holds back while it asks. */
type HeldLeave =
  /** A click on a link to another page of the app. */
  | { kind: "link"; anchor: HTMLAnchorElement }
  /** Back, already taken off the sentinel entry: the page is still here. */
  | { kind: "back" };

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
 * Three ways out are covered, and they need three different answers:
 *
 * - **Reload, close, a typed address, a link to another site**: the page is
 *   unloading, and only the browser's own prompt can stop that. Its wording is
 *   the browser's and cannot be changed.
 * - **A link to another page of the app** (a back link, the sidebar): the click
 *   is caught on its way down, before the link's own handler sees it, and held.
 *   Leaving replays the click on the same link, so the app navigates exactly as
 *   it would have.
 * - **Back**: a `popstate` cannot be stopped — it targets the window itself, so
 *   every listener runs at the target in registration order, and the router's
 *   was registered first. So Back is given nowhere to go instead: while the
 *   guard is active, one extra *sentinel* entry for this same address sits on
 *   top of the history. Back pops only the sentinel, the address does not
 *   change, the router restores the page it is already showing, and the guard
 *   asks. Staying pushes the sentinel again; leaving takes one more step back.
 *
 * The sentinel carries a copy of the entry's own state, the router's fields
 * included, so the App Router treats it as one of its own: its patched
 * `pushState` passes an entry that already carries them through untouched, and
 * a traversal onto either entry is an ordinary restore of this same page,
 * never the reload it gives an entry it did not write.
 *
 * **The sentinel is taken off again whenever the guard stands down** — a save,
 * or leaving by an answered link — so the history is not left with a
 * duplicate. It is taken off only while it is the current entry, and always by
 * a Back whose landing is waited for, which fixes the order around the page's
 * own navigation:
 *
 * - A save that moves on (a new article's `replace` to its own address) must
 *   stand the guard down when the save is *pressed*, not when it lands. The
 *   step off the sentinel is then long over before the router's navigation
 *   commits, and that navigation replaces or pushes from the page's own entry.
 *   Standing down in the same tick as the navigation would let the late Back
 *   undo it.
 * - A push from code while the guard is still active (a Cancel button) commits
 *   the new entry before this hook's cleanup runs, so the cleanup no longer
 *   finds the sentinel current and leaves the history alone: the sentinel
 *   stays behind as one extra entry for this page, which is harmless.
 * - A link answered with "leave" steps off the sentinel first and replays the
 *   click only once it has landed.
 * - Arming again while a step off is still on its way waits for it to land,
 *   so the step never takes the new sentinel with it (React's development
 *   double-mount does exactly this on every mount).
 *
 * A refresh of the page's data while the sentinel is current rewrites the
 * entry's state without the sentinel's mark; the entry then behaves like the
 * page's own, and standing down leaves it behind rather than guessing.
 *
 * The two held kinds are for the caller to ask about, in its own dialog:
 * `asking` opens it, and its answers are `stay` and `leave`.
 *
 * **What the page does itself is never caught**: a save that moves to another
 * route, a replace, a push from code. Only the person's own ways out are.
 * Links that open elsewhere (a new tab, a download, a modified click) and links
 * inside editable content are left alone. Forward is not guarded: arming the
 * guard pushes the sentinel, which drops any forward history, and a Forward
 * back onto the sentinel after a Back lands on this same page.
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
    const ownHref = window.location.href;

    const armed = whenSettled(ensureSentinel);

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

    const onPopState = (event: PopStateEvent) => {
      if (leaving.current || isStepOff(event)) return;
      // Forward onto the sentinel after a Back: nothing is leaving.
      if (isSentinel(event.state)) return;
      // A jump of more than one entry (the browser's history menu) lands on
      // another address, and the router has already gone there.
      if (window.location.href !== ownHref) return;
      // Nothing behind this page (it opened the tab): Back cannot leave, so
      // there is nothing to ask. The Navigation API says so where it exists.
      if (canGoBack() === false) return;
      setHeld({ kind: "back" });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      armed.cancel();
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      if (isSentinel(window.history.state)) stepOff();
    };
  }, [active]);

  return {
    asking: active && held !== null,
    stay: () => {
      if (held === null) return;
      setHeld(null);
      // Back took the sentinel off; put it back for the next one.
      if (held.kind === "back" && active) ensureSentinel();
    },
    leave: () => {
      if (held === null) return;
      leaving.current = true;
      setHeld(null);
      if (held.kind === "back") {
        window.history.back();
        return;
      }
      const { anchor } = held;
      const follow = () => {
        if (anchor.isConnected) anchor.click();
        else window.location.assign(anchor.href);
      };
      if (isSentinel(window.history.state)) stepOff(follow);
      else follow();
    },
  };
}

/** The key marking an entry as a guard's sentinel, beside the router's own. */
const SENTINEL_KEY = "__sogLeaveGuardSentinel";

function isSentinel(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    Reflect.get(state, SENTINEL_KEY) === true
  );
}

/**
 * Pushes the sentinel unless the current entry already is one: this same
 * address, with a copy of the current entry's state and the mark. No URL is
 * passed, so the address stays exactly as it is.
 */
function ensureSentinel() {
  const current: unknown = window.history.state;
  if (isSentinel(current)) return;
  const state =
    typeof current === "object" && current !== null ? { ...current } : {};
  window.history.pushState({ ...state, [SENTINEL_KEY]: true }, "");
}

// A step off the sentinel on its way: the `popstate` it will end in, and
// what waits for it. Module state, because the history is the window's, and a
// guard armed again must wait on a step its previous arming took.
let stepping = false;
const settled = new Set<() => void>();
const stepOffEvents = new WeakSet<Event>();

/** Whether this `popstate` is the landing of a step off, not the person's. */
function isStepOff(event: Event): boolean {
  return stepOffEvents.has(event);
}

/** Steps back off the sentinel, then runs `then` once the step has landed. */
function stepOff(then?: () => void) {
  if (then) settled.add(then);
  if (stepping) return;
  stepping = true;
  const landed = (event: PopStateEvent) => {
    window.removeEventListener("popstate", landed);
    stepOffEvents.add(event);
    stepping = false;
    const waiting = [...settled];
    settled.clear();
    for (const run of waiting) run();
  };
  window.addEventListener("popstate", landed);
  window.history.back();
}

/** Runs `run` now, or once a step off the sentinel still on its way lands. */
function whenSettled(run: () => void): { cancel: () => void } {
  if (!stepping) {
    run();
    return { cancel: () => {} };
  }
  settled.add(run);
  return { cancel: () => settled.delete(run) };
}

/**
 * Whether the history has an entry behind this one, where the browser has the
 * Navigation API to say it (the DOM typings do not carry it yet), else `null`.
 */
function canGoBack(): boolean | null {
  const navigation: unknown = Reflect.get(window, "navigation");
  if (typeof navigation !== "object" || navigation === null) return null;
  const can: unknown = Reflect.get(navigation, "canGoBack");
  return typeof can === "boolean" ? can : null;
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
