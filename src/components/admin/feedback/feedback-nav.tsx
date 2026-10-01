"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { DEFAULT_FEEDBACK_RANGE, type FeedbackRange } from "./feedback-range";
import { adminFeedbackHref, type FeedbackHref, type FeedbackPlace } from "./feedback-place";

/** The range on show, set by the page shell so every link carries it. */
const FeedbackRangeContext = createContext<FeedbackRange>(DEFAULT_FEEDBACK_RANGE);

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
  const range = useContext(FeedbackRangeContext);
  return useCallback((place) => adminFeedbackHref(place, range), [range]);
}

export function useFeedbackRange(): FeedbackRange {
  return useContext(FeedbackRangeContext);
}
