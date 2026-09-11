"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { resolveInternalPath } from "@/lib/navigation/internal-path";
import { toInternalPathname } from "@/lib/navigation/locale-path";
import { usePinIsSet } from "@/services/pin";
import { PinUnlockFlow } from "./pin-unlock-flow";

/**
 * Where entering the PIN sends the parent: the `?redirect=` target the proxy's
 * bounce carried, minus this gate itself.
 *
 * `resolveInternalPath` rejects any off-origin target (protocol-relative,
 * backslash, absolute-URL, whitespace-smuggling variants) and falls back to the
 * dashboard — never hand-roll that check. **Navigation then uses the raw
 * value**, which is the localized path the reader was actually on
 * (`/fi/kauppa`), so they return to the page they left rather than its English
 * twin.
 *
 * The loop guard is the one place that must *not* use it raw: matching a value
 * against a route shape means normalizing it first, or `/fi/parent/unlock`
 * fails to equal `ROUTES.customer.unlock` and unlocking navigates straight back
 * to the gate it just left.
 */
export function resolveUnlockDestination(target: string | null): string {
  const safe = resolveInternalPath(target, ROUTES.customer.dashboard);
  return toInternalPathname(safe) === ROUTES.customer.unlock
    ? ROUTES.customer.dashboard
    : safe;
}

/**
 * The parent lock gate (`/parent/unlock`). A locked customer is redirected here
 * by the proxy from any non-exempt route. The create/enter/forgot UI lives in
 * `PinUnlockFlow`; this wrapper resolves the post-unlock destination and, on
 * success, does a full-page navigation so the proxy re-runs and sees the fresh
 * unlock cookie. (The Add Gamer dialog reuses `PinUnlockFlow` with an in-place
 * swap instead of a navigation.)
 */
export function UnlockGate({ initialPinIsSet }: { initialPinIsSet?: boolean }) {
  const { data: pinIsSet } = usePinIsSet(initialPinIsSet);

  // Read ?redirect= from the URL once, in a lazy state initializer
  // (window.location, not useSearchParams, to avoid forcing a Suspense
  // boundary — same approach as reset-password-form). The resolution and the
  // loop guard live in `resolveUnlockDestination` above. The initializer is
  // SSR-guarded; `redirectTo` is read only in the post-unlock navigation, never
  // in rendered markup, so the server's default and the client's resolved value
  // can't mismatch.
  const [redirectTo] = useState<string>(() => {
    if (typeof window === "undefined") return ROUTES.customer.dashboard;
    return resolveUnlockDestination(
      new URLSearchParams(window.location.search).get("redirect"),
    );
  });

  // Normally `pinIsSet` is seeded server-side, so this never shows. It only
  // appears in the degraded path where the server prefetch came back undefined
  // and the client query is still in flight.
  if (pinIsSet === undefined) {
    return <UnlockSkeleton />;
  }

  return (
    <PinUnlockFlow
      pinIsSet={pinIsSet}
      onUnlocked={() => {
        window.location.href = redirectTo;
      }}
    />
  );
}

/** Placeholder while `pin_is_set` resolves — no interactive elements, so the
 *  real pad simply appears in its final place (no-layout-shift rule). */
function UnlockSkeleton() {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-8" aria-hidden="true">
      <Lock className="h-10 w-10 text-muted-foreground" />
      <div className="flex gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i} className="h-14 w-12 rounded-lg border-2 border-border" />
        ))}
      </div>
      <div className="grid grid-cols-3 place-items-center gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-16 w-16 animate-pulse rounded-full bg-lifted" />
        ))}
      </div>
    </div>
  );
}
