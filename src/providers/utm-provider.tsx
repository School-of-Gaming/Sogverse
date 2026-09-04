"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { UtmAttribution } from "@/lib/utm";

/**
 * Holds the UTM attribution the visitor arrived with (`utm_source`,
 * `utm_medium`, `utm_campaign` on the landing URL) for the duration of the
 * visit, so browsing shop → about → home → register as client-side navigation
 * still yields it at account creation.
 *
 * Flow: the proxy reads and sanitises the params and sets `x-utm` on the
 * request; the root layout parses that header and passes the result in here as
 * `initialUtm`; the two registration forms read it from context and include it
 * in the new user's signup metadata. The params are deliberately left in the URL
 * rather than stripped — the first in-app navigation drops them from the address
 * bar anyway, and leaving them means a reload or back-button on the landing page
 * recovers the values instead of losing them.
 *
 * **`useState(initial)` seeds once, and the prop must never be synced into
 * state afterwards.** This is a live requirement, not a guard against a
 * hypothetical: the root layout *does* re-execute during a session — the locale
 * provider calls `router.refresh()` on a locale change, which refetches the
 * route tree and re-runs this layout against the current URL, which by then
 * usually carries no UTM params and so passes an empty attribution. A
 * `useEffect` syncing the prop into state would wipe the values the first time
 * anyone switched language.
 *
 * **Nothing here writes the values to the browser — no cookie, no
 * `localStorage`, no `sessionStorage`.** That is a design property worth keeping
 * (attribution that dies with the visit is attribution nobody has to reason
 * about deleting), but it is no longer claimed as the thing that keeps this
 * processing lawful: reading the params off the landing URL is itself what
 * engages Art 5(3), and it has already happened in the proxy by the time this
 * provider mounts. `src/lib/utm.ts` has the full account.
 */

const UtmContext = createContext<UtmAttribution | undefined>(undefined);

interface UtmProviderProps {
  /**
   * The sanitised attribution from this request's `x-utm` header — three
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
 * The attribution this visit arrived with. All three fields null is the common
 * case, and `hasUtmAttribution` is the way to ask whether anything survived.
 */
export function useUtm(): UtmAttribution {
  const ctx = useContext(UtmContext);
  if (ctx === undefined) {
    throw new Error("useUtm must be used within a UtmProvider");
  }
  return ctx;
}
