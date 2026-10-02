"use client";

/**
 * Where a language switch should land, for a page whose own path is written
 * per locale.
 *
 * The locale picker re-issues the current route under the new prefix with the
 * same params, which is right wherever a param means the same thing in every
 * locale. A page whose segment is written per locale — a slug derived from
 * that locale's title, resolving in that locale only — would land on a 404
 * that way, so it tells the picker its own path in each locale instead, and
 * the picker prefers that path when it has one.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { SupportedLocale } from "@/lib/constants/locales";

/** The current page's own path in each locale it can be switched to. */
export type LocaleSwitchPathMap = Partial<Record<SupportedLocale, string>>;

interface LocaleSwitchPathsContextValue {
  paths: LocaleSwitchPathMap | null;
  setPaths: Dispatch<SetStateAction<LocaleSwitchPathMap | null>>;
}

const LocaleSwitchPathsContext =
  createContext<LocaleSwitchPathsContextValue | null>(null);

export function LocaleSwitchPathsProvider({ children }: { children: ReactNode }) {
  const [paths, setPaths] = useState<LocaleSwitchPathMap | null>(null);
  return (
    <LocaleSwitchPathsContext.Provider value={{ paths, setPaths }}>
      {children}
    </LocaleSwitchPathsContext.Provider>
  );
}

/**
 * Registers the rendering page's path in each locale for as long as it is
 * mounted. Rendered from a server component, so it takes plain data.
 *
 * **The cleanup clears only its own registration.** Navigating from one such
 * page to another mounts the new registration before the old one's cleanup
 * runs, so an unconditional clear would wipe the page now on screen; the
 * identity check leaves a registration that has already been replaced alone.
 */
export function LocaleSwitchPaths({ paths }: { paths: LocaleSwitchPathMap }) {
  const context = useContext(LocaleSwitchPathsContext);
  const setPaths = context?.setPaths;

  useEffect(() => {
    if (setPaths === undefined) return;
    setPaths(paths);
    return () => {
      setPaths((current) => (current === paths ? null : current));
    };
  }, [setPaths, paths]);

  return null;
}

/** The current page's registered paths, or null when it registered none. */
export function useLocaleSwitchPaths(): LocaleSwitchPathMap | null {
  return useContext(LocaleSwitchPathsContext)?.paths ?? null;
}
