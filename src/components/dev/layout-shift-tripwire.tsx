"use client";

/**
 * Dev-only layout-shift tripwire — diagnostic for the intermittent
 * "content shifts down ~20-40px a few moments after load" bug. Renders
 * nothing; only observes. Mounted (development builds only) from the root
 * layout. Remove once the bug is convicted — tracked in TODO.md.
 *
 * Two channels, because the two suspect families are invisible to each
 * other's instrument:
 *
 * 1. Layout shifts. The browser's layout engine emits a `layout-shift`
 *    performance entry whenever a rendered element paints at a different
 *    position than the previous frame (user-input-adjacent shifts are
 *    flagged, scroll and transforms excluded). We subscribe with
 *    `buffered: true` so shifts from before hydration are delivered too,
 *    and log each entry's attributed nodes with their before/after rects.
 *    The moment the bug strikes, the culprit's tag/classes and the exact
 *    pixel delta are in the console — no repro needed.
 *
 * 2. Scroll-residue landings. Next.js only scrolls to top on a soft nav
 *    when the changed segment's top is out of view, so navigating with a
 *    small scroll offset (< ~64px, the sticky header's height) lands the
 *    new page still scrolled — content sits that many pixels high. The
 *    layout-shift API deliberately ignores scroll, so this channel logs
 *    any route landing with a non-zero scrollY (hash navigations excluded;
 *    a nonzero landing is expected there).
 *
 * Everything is mirrored into `window.__layoutShiftLog` (ring buffer,
 * newest last) so the evidence survives until you look. Console lines are
 * prefixed `[tripwire]`; shift entries are collapsed groups — expand one
 * and the logged nodes are live references you can right-click and reveal
 * in the Elements panel.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// The Layout Instability API types aren't in lib.dom.d.ts yet.
interface LayoutShiftAttribution {
  node: Node | null;
  previousRect: DOMRectReadOnly;
  currentRect: DOMRectReadOnly;
}

interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
  sources: LayoutShiftAttribution[];
}

type TripwireLogEntry =
  | {
      kind: "shift";
      /** ms since navigation start (performance timeline). */
      time: number;
      value: number;
      hadRecentInput: boolean;
      sources: {
        label: string;
        node: Node | null;
        previousRect: DOMRectReadOnly;
        currentRect: DOMRectReadOnly;
      }[];
    }
  | {
      kind: "landing";
      time: number;
      pathname: string;
      scrollY: number;
    };

declare global {
  interface Window {
    __layoutShiftLog?: TripwireLogEntry[];
  }
}

const LOG_CAP = 100;

// Shifts below this score are sub-pixel jitter — kept in the ring buffer,
// left out of the console. The reported ~30px whole-column drop scores
// roughly 0.03 on a laptop viewport, two orders of magnitude above this.
const CONSOLE_MIN_VALUE = 0.0005;

function pushLog(entry: TripwireLogEntry) {
  const log = (window.__layoutShiftLog ??= []);
  log.push(entry);
  if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
}

function describeNode(node: Node | null): string {
  const el = node instanceof Element ? node : (node?.parentElement ?? null);
  if (!el) return "(detached)";
  const id = el.id ? `#${el.id}` : "";
  const cls =
    typeof el.className === "string" && el.className
      ? "." + el.className.split(/\s+/).filter(Boolean).slice(0, 4).join(".")
      : "";
  const text = el.textContent.trim().slice(0, 40);
  return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ""}`;
}

function fmtRect(r: DOMRectReadOnly): string {
  return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
}

// Narrowing predicate instead of an `as` cast: the observer below only
// subscribes to the "layout-shift" entry type, and that check is exactly
// what makes the narrowing safe.
function isLayoutShift(entry: PerformanceEntry): entry is LayoutShiftEntry {
  return entry.entryType === "layout-shift";
}

// Module-level guards: the component lives in the root layout so it mounts
// once per document, but React StrictMode double-invokes effects in dev and
// a second observer would double-log every shift.
let observerInstalled = false;
let lastLandingPathname: string | null = null;

function installShiftObserver() {
  if (observerInstalled) return;
  if (!PerformanceObserver.supportedEntryTypes.includes("layout-shift")) {
    return; // Chromium-only API; silently inert elsewhere.
  }
  observerInstalled = true;

  const observer = new PerformanceObserver((list) => {
    for (const shift of list.getEntries()) {
      if (!isLayoutShift(shift)) continue;
      const sources = shift.sources.map((s) => ({
        label: describeNode(s.node),
        node: s.node,
        previousRect: s.previousRect,
        currentRect: s.currentRect,
      }));
      pushLog({
        kind: "shift",
        time: Math.round(shift.startTime),
        value: shift.value,
        hadRecentInput: shift.hadRecentInput,
        sources,
      });

      if (shift.value < CONSOLE_MIN_VALUE) continue;
      console.groupCollapsed(
        `[tripwire] layout shift @${Math.round(shift.startTime)}ms ` +
          `value=${shift.value.toFixed(4)}` +
          (shift.hadRecentInput ? " (recent input — likely user-caused)" : ""),
      );
      for (const s of sources) {
        const dy = Math.round(s.currentRect.y - s.previousRect.y);
        console.log(
          `${s.label}\n  dy=${dy}px  ${fmtRect(s.previousRect)} -> ${fmtRect(s.currentRect)}`,
          s.node,
        );
      }
      console.groupEnd();
    }
  });
  observer.observe({ type: "layout-shift", buffered: true });
  // Never disconnected: the tripwire watches for the document's lifetime.
}

function logLandingScroll(pathname: string) {
  if (lastLandingPathname === pathname) return;
  lastLandingPathname = pathname;
  if (window.location.hash) return;
  const scrollY = Math.round(window.scrollY);
  if (scrollY === 0) return;
  pushLog({
    kind: "landing",
    time: Math.round(performance.now()),
    pathname,
    scrollY,
  });
  console.log(
    `[tripwire] landed ${pathname} with scrollY=${scrollY}px — ` +
      `content sits ${scrollY}px high (soft-nav scroll residue)`,
  );
}

export function LayoutShiftTripwire() {
  const pathname = usePathname();

  useEffect(() => {
    installShiftObserver();
  }, []);

  useEffect(() => {
    logLandingScroll(pathname);
  }, [pathname]);

  return null;
}
