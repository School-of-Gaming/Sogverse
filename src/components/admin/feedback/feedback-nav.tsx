"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { DEFAULT_FEEDBACK_RANGE, type FeedbackRange } from "./feedback-range";
import {
  adminFeedbackHref,
  type FeedbackHref,
  type FeedbackHrefBuilder,
  type FeedbackPlace,
} from "./feedback-place";

/**
 * How a place becomes a URL. The live admin routes by default; the preview
 * scene provides its own, so every link inside the scene stays inside it.
 */
const FeedbackHrefContext = createContext<FeedbackHrefBuilder>(adminFeedbackHref);

/** The range on show, set by the page shell so every link carries it. */
const FeedbackRangeContext = createContext<FeedbackRange>(DEFAULT_FEEDBACK_RANGE);

export function FeedbackHrefProvider({
  build,
  children,
}: {
  build: FeedbackHrefBuilder;
  children: ReactNode;
}) {
  return <FeedbackHrefContext.Provider value={build}>{children}</FeedbackHrefContext.Provider>;
}

export function FeedbackRangeProvider({
  range,
  children,
}: {
  range: FeedbackRange;
  children: ReactNode;
}) {
  return <FeedbackRangeContext.Provider value={range}>{children}</FeedbackRangeContext.Provider>;
}

/** A place's link at the range on show. */
export function useFeedbackHref(): (place: FeedbackPlace) => FeedbackHref {
  const build = useContext(FeedbackHrefContext);
  const range = useContext(FeedbackRangeContext);
  return useCallback((place) => build(place, range), [build, range]);
}

/** A place's link at another range — what the range control is made of. */
export function useFeedbackRangeHref(): FeedbackHrefBuilder {
  return useContext(FeedbackHrefContext);
}

export function useFeedbackRange(): FeedbackRange {
  return useContext(FeedbackRangeContext);
}
