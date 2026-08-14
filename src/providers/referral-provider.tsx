"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Holds the referral code the visitor arrived with (`?ref=` on the landing URL)
 * for the duration of the visit, so browsing shop → help → home → register as
 * client-side navigation still yields it at account creation.
 *
 * Flow: the proxy reads and sanitises the param and sets `x-referral-code` on
 * the request; the root layout reads that header and passes it in here as
 * `initialReferralCode`; the two registration forms read it from context and
 * include it in the new user's signup metadata. The param is deliberately left
 * in the URL rather than stripped — the first in-app navigation drops it from
 * the address bar anyway, and leaving it means a reload or back-button on the
 * landing page recovers the value instead of losing it.
 *
 * **`useState(initial)` seeds once, and the prop must never be synced into
 * state afterwards.** This is a live requirement, not a guard against a
 * hypothetical: the root layout *does* re-execute during a session — the locale
 * provider calls `router.refresh()` on a locale change, which refetches the
 * route tree and re-runs this layout against the current URL, which by then
 * usually has no `?ref` and so passes `null`. A `useEffect` syncing the prop
 * into state would wipe the code the first time anyone switched language.
 *
 * **Nothing here writes the value to the browser — no cookie, no
 * `localStorage`, no `sessionStorage`, ever.** That absence is the single
 * constraint the whole design hangs on: device storage would put this
 * processing into ePrivacy scope and require a consent banner for every visitor
 * to the site. "Attribution gets lost on reload" is therefore not a bug, and
 * `sessionStorage` is not the harmless middle ground it looks like — being
 * tab-scoped does not stop it being storage on the user's device. The full set
 * of constraints, and why each is load-bearing for the legal position, is
 * written down in `src/lib/referral.ts`.
 */

const ReferralContext = createContext<string | null | undefined>(undefined);

interface ReferralProviderProps {
  /**
   * The sanitised code from this request's `x-referral-code` header, or null.
   * Read once, at mount — see the note above.
   */
  initialReferralCode: string | null;
  children: ReactNode;
}

export function ReferralProvider({
  initialReferralCode,
  children,
}: ReferralProviderProps) {
  const [referralCode] = useState<string | null>(initialReferralCode);

  return (
    <ReferralContext.Provider value={referralCode}>
      {children}
    </ReferralContext.Provider>
  );
}

/** The code this visit arrived with, or null — which is the common case. */
export function useReferralCode(): string | null {
  const ctx = useContext(ReferralContext);
  if (ctx === undefined) {
    throw new Error("useReferralCode must be used within a ReferralProvider");
  }
  return ctx;
}
