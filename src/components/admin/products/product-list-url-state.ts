"use client";

import { useCallback, useState } from "react";

/**
 * The admin product list's narrowing controls, mirrored into the query string.
 *
 * The point is the Back button. An admin works these lists by narrowing to a
 * handful of rows, opening one, and coming back — and coming back to an
 * unfiltered list means re-typing the search and re-picking the filters every
 * single time. Holding the state in the URL costs one `replaceState` per change
 * and hands the browser everything it needs: clicking into a product pushes a
 * history entry from the *current* URL, so Back lands on the narrowed list.
 *
 * `replaceState` rather than `router.replace`: nothing on the server depends on
 * these params, and an RSC navigation per keystroke would make the field feel
 * laggy for a filter that runs entirely over rows already in memory. No history
 * entries are pushed either, so Back leaves the list rather than stepping back
 * through every character the admin typed.
 *
 * Each write reads `window.location.search` afresh instead of a snapshot taken
 * at render, which is what lets the search box and the club filter bar own
 * separate params without either clobbering the other's write.
 */
export const PRODUCT_LIST_PARAMS = {
  search: "q",
  day: "day",
  gedu: "gedu",
  language: "lang",
  municipality: "muni",
} as const;

function readParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(key);
  return value === null || value === "" ? null : value;
}

function writeParam(key: string, value: string | null): void {
  const params = new URLSearchParams(window.location.search);
  if (value === null || value === "") params.delete(key);
  else params.set(key, value);
  const query = params.toString();
  const { pathname } = window.location;
  window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
}

/**
 * One query-param-backed value: seeded from the URL on mount, written back on
 * every change.
 *
 * The initializer is SSR-guarded and answers `null` on the server. That is only
 * safe because nothing built on this hook renders during SSR — the list's
 * controls appear with the products, which are fetched client-side — so the
 * server's `null` and the client's restored value are never both painted. A
 * server prefetch of the product list would have to move the seed into the
 * markup rather than leave this initializer to differ from it.
 */
export function useUrlParamState(
  key: string,
): [string | null, (next: string | null) => void] {
  const [value, setValue] = useState<string | null>(() => readParam(key));

  const set = useCallback(
    (next: string | null) => {
      setValue(next);
      writeParam(key, next);
    },
    [key],
  );

  return [value, set];
}

/**
 * A stored param value, but only while it still names something the control can
 * offer.
 *
 * A bookmarked or hand-edited URL outlives the data it points at: a gedu leaves,
 * a municipality's last club is retired, and the id in the query string now
 * matches no option. Falling back to "all" is the honest answer — the
 * alternative is a filter trigger displaying a raw UUID and a list narrowed to
 * nothing, with no way to tell which of the two happened.
 */
export function optionInRange(
  options: readonly { value: string }[],
  value: string | null,
): string | null {
  if (value === null) return null;
  return options.some((option) => option.value === value) ? value : null;
}
