"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { UtmAttribution } from "@/lib/utm";

/**
 * Holds the UTM attribution the visitor arrived with (`utm_source`,
 * `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` on the landing URL)
 * in memory for the document's life, for one reader: the consent banner, which
 * writes the attribution cookie from it when marketing is accepted mid-visit.
 * Nothing else reads attribution in the browser; the routes that store it read
 * the cookie off their own request.
 *
 * Flow: the proxy reads and sanitises the params and sets `x-utm` on the
 * request; the root layout parses that header and passes the result in here as
 * `initialUtm`. The params are deliberately left in the URL rather than stripped
 * — the first in-app navigation drops them from the address bar anyway, and
 * leaving them means a reload or back-button on the landing page recovers the
 * values instead of losing them.
 *
 * **`useState(initial)` seeds once, and the prop must never be synced into
 * state afterwards.** This is a live requirement, not a guard against a
 * hypothetical: the document layout *does* re-execute during a session. An
 * ordinary in-app navigation preserves it, but a language switch re-issues the
 * current route under the new locale prefix, and that changes the segment the
 * layout is parameterised by — so it runs again, against a URL that by then
 * usually carries no UTM params and so passes an empty attribution. A
 * `useEffect` syncing the prop into state would wipe the values the first time
 * anyone switched language.
 *
 * **Nothing here writes to the browser.** The cookie the banner and the proxy
 * write is `src/lib/utm.ts`'s account, including what consent does and does not
 * settle: reading the params off the landing URL engages Art 5(3) on its own,
 * and it has already happened in the proxy by the time this provider mounts.
 */

const UtmContext = createContext<UtmAttribution | undefined>(undefined);

interface UtmProviderProps {
  /**
   * The sanitised attribution from this request's `x-utm` header — five
   * fields, each a value or null. Read once, at mount — see the note above.
   */
  initialUtm: UtmAttribution;
  children: ReactNode;
}

export function UtmProvider({ initialUtm, children }: UtmProviderProps) {
  const [utm] = useState<UtmAttribution>(initialUtm);

  return <UtmContext.Provider value={utm}>{children}</UtmContext.Provider>;
}

/**
 * The attribution this visit arrived with. All five fields null is the common
 * case, and `hasUtmAttribution` is the way to ask whether anything survived.
 */
export function useUtm(): UtmAttribution {
  const ctx = useContext(UtmContext);
  if (ctx === undefined) {
    throw new Error("useUtm must be used within a UtmProvider");
  }
  return ctx;
}
