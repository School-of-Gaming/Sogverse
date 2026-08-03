"use client";

import { useEffect, useState } from "react";

/**
 * The house debounce for a value that drives a request.
 *
 * A search box is the case this exists for: a typist produces one value per
 * keystroke, and firing a request for each of them spends a round trip on
 * every intermediate word nobody meant to search for. Debouncing the *value*
 * rather than the handler keeps the input itself instant — what the user sees
 * updates on every keystroke, and only what the query reads lags.
 */
export const SEARCH_DEBOUNCE_MS = 250;

export function useDebouncedValue<T>(
  value: T,
  ms: number = SEARCH_DEBOUNCE_MS,
): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);

  return settled;
}
