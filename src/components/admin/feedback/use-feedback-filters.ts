"use client";

import { useCallback, useState } from "react";
import {
  FEEDBACK_FILTER_DIMENSIONS,
  NO_FEEDBACK_FILTERS,
  type FeedbackFilterDimension,
  type FeedbackFilters,
} from "./feedback-filters";

/**
 * The page's drill-down filters, held locally and mirrored into the query
 * string.
 *
 * Seeded from the filters the route parsed, not from `window`: this page is
 * rendered on the server with its data, so a seed only the browser could read
 * would paint one page on the server and another on hydration. The mirror is
 * `replaceState`, as on the admin lists — every figure is recomputed in memory
 * from the dataset already on the page, so an RSC round trip per click would buy
 * nothing, and Back should leave the page rather than undo a drill-down. Each
 * write reads the live query string, so the range the route owns is kept.
 */
export function useFeedbackFilters(initial: FeedbackFilters): {
  filters: FeedbackFilters;
  setFilter: (dimension: FeedbackFilterDimension, id: string | null) => void;
  clearFilters: () => void;
} {
  const [filters, setFilters] = useState<FeedbackFilters>(initial);

  const write = useCallback((next: FeedbackFilters) => {
    setFilters(next);
    const params = new URLSearchParams(window.location.search);
    for (const dimension of FEEDBACK_FILTER_DIMENSIONS) {
      const value = next[dimension];
      if (value === null) params.delete(dimension);
      else params.set(dimension, value);
    }
    const query = params.toString();
    const { pathname } = window.location;
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }, []);

  const setFilter = useCallback(
    (dimension: FeedbackFilterDimension, id: string | null) =>
      write({ ...filters, [dimension]: id }),
    [filters, write],
  );

  const clearFilters = useCallback(() => write(NO_FEEDBACK_FILTERS), [write]);

  return { filters, setFilter, clearFilters };
}
