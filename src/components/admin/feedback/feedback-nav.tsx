"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AdminFeedbackDataset,
  FeedbackSource,
} from "@/services/session-feedback/admin-feedback.contracts";
import { adminFeedbackHref, type FeedbackHref, type FeedbackPlace } from "./feedback-place";
import {
  minimumSelectionDays,
  selectionPeriods,
  selectionQuery,
} from "./feedback-selection";
import {
  bucketUnitFor,
  type FeedbackBucketUnit,
  type FeedbackPeriod,
  type FeedbackPeriods,
} from "./feedback-tally";

/**
 * What every feedback page is handed by its route: the whole history, read
 * once, and the selection the URL named. Everything on the page is computed
 * from these in the browser, so moving the selection costs no read.
 */
export interface FeedbackRead {
  /** The one source collected today; a second arrives as a switch beside the timeline. */
  source: FeedbackSource;
  dataset: AdminFeedbackDataset;
  /** The days the timeline draws. */
  history: FeedbackPeriod;
  /** The selection the page opens on, already clamped into the history. */
  selection: FeedbackPeriod;
}

interface FeedbackSelectionState {
  history: FeedbackPeriod;
  /** The timeline's bucket; the keyboard steps and the minimum selection are one of them. */
  unit: FeedbackBucketUnit;
  minDays: number;
  selection: FeedbackPeriod;
  /** Shows a selection while it is being dragged: drawn on the next frame, not written to the URL. */
  preview: (selection: FeedbackPeriod) => void;
  /** Settles on a selection: drawn at once and written to the URL. */
  commit: (selection: FeedbackPeriod) => void;
}

const FeedbackSelectionContext = createContext<FeedbackSelectionState | null>(null);

function samePeriod(a: FeedbackPeriod, b: FeedbackPeriod): boolean {
  return a.from === b.from && a.to === b.to;
}

/**
 * The selection replaces itself in the URL, so a reload or a copied link opens
 * on it. A replace rather than a push: dragging is adjusting a view, and
 * every drag landing in the back button's history would bury the page the
 * admin came from.
 */
function writeSelectionToUrl(selection: FeedbackPeriod): void {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(selectionQuery(selection))) {
    url.searchParams.set(key, value);
  }
  window.history.replaceState(null, "", url);
}

/**
 * **The selection on show, owned by the page.** A drag previews a new
 * selection at most once a frame, so everything computed from it follows the
 * pointer without queueing renders behind it; letting go commits it, which
 * also writes it to the URL. Every link inside carries it.
 */
export function FeedbackSelectionProvider({
  history,
  initial,
  children,
}: {
  history: FeedbackPeriod;
  initial: FeedbackPeriod;
  children: ReactNode;
}) {
  const [selection, setSelection] = useState(initial);
  const frame = useRef(0);
  const pending = useRef(initial);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const settle = useCallback((next: FeedbackPeriod) => {
    setSelection((previous) => (samePeriod(previous, next) ? previous : next));
  }, []);

  const preview = useCallback(
    (next: FeedbackPeriod) => {
      pending.current = next;
      if (frame.current !== 0) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        settle(pending.current);
      });
    },
    [settle],
  );

  const commit = useCallback(
    (next: FeedbackPeriod) => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      settle(next);
      writeSelectionToUrl(next);
    },
    [settle],
  );

  const value = useMemo((): FeedbackSelectionState => {
    const unit = bucketUnitFor(history);
    return { history, unit, minDays: minimumSelectionDays(unit), selection, preview, commit };
  }, [history, selection, preview, commit]);

  return (
    <FeedbackSelectionContext.Provider value={value}>{children}</FeedbackSelectionContext.Provider>
  );
}

export function useFeedbackSelection(): FeedbackSelectionState {
  const state = useContext(FeedbackSelectionContext);
  if (state === null) throw new Error("A feedback page renders inside FeedbackSelectionProvider");
  return state;
}

/** The selection and the equal-length span before it, which every builder takes. */
export function useFeedbackPeriods(): FeedbackPeriods {
  const { selection } = useFeedbackSelection();
  return useMemo(() => selectionPeriods(selection), [selection]);
}

/** A place's link at the selection on show. */
export function useFeedbackHref(): (place: FeedbackPlace) => FeedbackHref {
  const { selection } = useFeedbackSelection();
  return useCallback((place) => adminFeedbackHref(place, selection), [selection]);
}
