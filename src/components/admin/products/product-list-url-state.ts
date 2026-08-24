"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The admin product list's narrowing controls, mirrored into the query string.
 *
 * The point is the Back button. An admin works these lists by narrowing to a
 * handful of rows, opening one, and coming back — and coming back to an
 * unfiltered list means re-typing the search and re-picking the filters every
 * single time. Holding the state in the URL hands the browser everything it
 * needs: clicking into a product pushes a history entry from the *current* URL,
 * so Back lands on the narrowed list.
 *
 * `replaceState` rather than `router.replace`: nothing on the server depends on
 * these params, and an RSC navigation per change would make the controls feel
 * laggy for a filter that runs entirely over rows already in memory. No history
 * entries are pushed either, so Back leaves the list rather than stepping back
 * through every character the admin typed.
 *
 * **The URL is a mirror, never the control's own state.** A dropdown writes once
 * per selection and can afford to be read straight back out of the query string;
 * a text field cannot, because `replaceState` is rate-limited — Safari throws
 * once a page passes ~100 calls in 30 seconds, which a search box reaches in a
 * couple of sentences. So the two hooks below differ in *when* they mirror and
 * in nothing else: the value the list filters on is local either way, and the
 * URL catches up.
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
 * For a control that changes once per gesture — a dropdown, a toggle — where
 * one `replaceState` per change is exactly one write. A field somebody *types*
 * into wants the debounced hook below instead.
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
 * How long the URL lags a text field. Long enough that ordinary typing writes
 * once at the end of a word rather than once per letter; short enough that an
 * admin who stops to read the narrowed list has already had their URL updated
 * before they reach for anything.
 */
const URL_MIRROR_DELAY_MS = 300;

/**
 * A text field's value, held locally and mirrored into the query string after a
 * pause in typing.
 *
 * **The list narrows on the returned value, not on the URL**, so every keystroke
 * still filters immediately — the debounce moves only the history write, which
 * nothing on screen reads. That is the whole of the difference from the hook
 * above, and it is what keeps the field off Safari's `replaceState` limit
 * (~100 calls per 30 seconds; a typed sentence is enough to trip it, and the
 * throw takes the keystroke's render down with it).
 *
 * `flush` writes whatever is pending at once, and the field's `onBlur` is the
 * caller to hook it to: clicking a product row blurs the input before the
 * navigation, which closes the one gap a pure timer leaves — an admin who types
 * and clicks through inside the delay, and comes Back to a URL a few characters
 * stale. A pending write is deliberately **not** flushed on unmount: by then the
 * navigation has already changed the URL, and `replaceState` would rewrite the
 * page being navigated *to*.
 *
 * Seeded and SSR-guarded exactly as the hook above, with the same condition on
 * it: nothing here renders on the server, so the server's empty string and the
 * client's restored value are never both painted.
 */
export function useDebouncedUrlParamState(
  key: string,
): [string, (next: string) => void, () => void] {
  const [value, setValue] = useState<string>(() => readParam(key) ?? "");
  /** The value owed to the URL, or `null` when the URL is already current. */
  const owed = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (owed.current === null) return;
    writeParam(key, owed.current);
    owed.current = null;
  }, [key]);

  const set = useCallback(
    (next: string) => {
      setValue(next);
      owed.current = next;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, URL_MIRROR_DELAY_MS);
    },
    [flush],
  );

  // Only the timer is dropped on unmount — see above for why the pending write
  // is not made.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return [value, set, flush];
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
