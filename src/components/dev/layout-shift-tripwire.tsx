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
 * newest last) so the evidence survives until you look, and
 * `copy(window.__layoutShiftReport())` in the console puts the whole
 * buffer on the clipboard as plain text — paste that straight into a
 * Claude session for investigation. Console lines are prefixed
 * `[tripwire]`; each shift logs as ONE flat multi-line string (the dev
 * log forwarder flattens console groups and drops their contents, so
 * grouped output loses exactly the source attributions that matter),
 * followed by the source nodes as live references you can reveal in the
 * Elements panel. Shifts with no recent input — the hunted kind, since
 * the bug strikes on data's schedule, not the user's — log at warn level
 * and are tagged UNPROMPTED so they stand out from navigation noise.
 * Every entry records the viewport size at observation time: shift
 * `value` is a fraction of the viewport, so the same pixel shift scores
 * wildly differently in a narrow window, and rect forensics are
 * unreadable without knowing the frame they happened in.
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

interface ShiftSource {
  label: string;
  node: Node | null;
  previousRect: DOMRectReadOnly;
  currentRect: DOMRectReadOnly;
}

type TripwireLogEntry =
  | {
      kind: "shift";
      /** ms since navigation start (performance timeline). */
      time: number;
      value: number;
      hadRecentInput: boolean;
      /** `${innerWidth}x${innerHeight}` when the shift was observed. */
      viewport: string;
      sources: ShiftSource[];
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
    /** Plain-text dump of the ring buffer — `copy(window.__layoutShiftReport())`. */
    __layoutShiftReport?: () => string;
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

// dx AND dy: the layout-shift API attributes purely horizontal movement
// too (a sidebar column growing shoves <main> sideways), and a dy-only
// line prints `dy=0px` for exactly those — hiding the signal.
function fmtSource(s: ShiftSource): string {
  const dx = Math.round(s.currentRect.x - s.previousRect.x);
  const dy = Math.round(s.currentRect.y - s.previousRect.y);
  return `  ${s.label}\n    dx=${dx}px dy=${dy}px  ${fmtRect(s.previousRect)} -> ${fmtRect(s.currentRect)}`;
}

function fmtShiftHeader(e: Extract<TripwireLogEntry, { kind: "shift" }>): string {
  return (
    `layout shift @${e.time}ms value=${e.value.toFixed(4)} viewport=${e.viewport}` +
    (e.hadRecentInput
      ? " (recent input — likely user-caused)"
      : " (UNPROMPTED — no recent input)")
  );
}

function buildReport(): string {
  const log = window.__layoutShiftLog ?? [];
  const lines = [
    `[tripwire report] ${new Date().toISOString()} url=${window.location.href} ` +
      `viewport=${window.innerWidth}x${window.innerHeight} dpr=${window.devicePixelRatio}`,
    `${log.length} entries, oldest first (cap ${LOG_CAP}; includes sub-threshold shifts the console omitted)`,
  ];
  for (const e of log) {
    if (e.kind === "landing") {
      lines.push(`@${e.time}ms landing ${e.pathname} scrollY=${e.scrollY}px (soft-nav scroll residue)`);
    } else {
      lines.push(fmtShiftHeader(e), ...e.sources.map(fmtSource));
    }
  }
  return lines.join("\n");
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
  window.__layoutShiftReport = buildReport;
  if (!PerformanceObserver.supportedEntryTypes.includes("layout-shift")) {
    return; // Chromium-only API; silently inert elsewhere.
  }
  observerInstalled = true;
  console.log(
    "[tripwire] armed — run copy(window.__layoutShiftReport()) for a paste-ready report",
  );

  const observer = new PerformanceObserver((list) => {
    for (const shift of list.getEntries()) {
      if (!isLayoutShift(shift)) continue;
      const entry = {
        kind: "shift" as const,
        time: Math.round(shift.startTime),
        value: shift.value,
        hadRecentInput: shift.hadRecentInput,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        sources: shift.sources.map((s) => ({
          label: describeNode(s.node),
          node: s.node,
          previousRect: s.previousRect,
          currentRect: s.currentRect,
        })),
      };
      pushLog(entry);

      if (shift.value < CONSOLE_MIN_VALUE) continue;
      // One flat string, not console.group: the dev log forwarder
      // flattens groups and drops their contents, so grouped output
      // reaches the terminal as a bare header with no attribution. The
      // nodes ride along as a trailing arg for Elements-panel inspection.
      const text = `[tripwire] ${fmtShiftHeader(entry)}\n${entry.sources.map(fmtSource).join("\n")}`;
      const nodes = entry.sources.map((s) => s.node);
      if (entry.hadRecentInput) console.log(text, nodes);
      else console.warn(text, nodes);
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
