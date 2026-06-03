"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { resolveInternalPath } from "@/lib/navigation/internal-path";
import { usePinIsSet } from "@/services/pin";
import { PinUnlockFlow } from "./pin-unlock-flow";

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

  const [redirectTo, setRedirectTo] = useState<string>(ROUTES.customer.dashboard);

  // Read ?redirect= from the URL once on mount (window.location, not
  // useSearchParams, to avoid forcing a Suspense boundary — same approach as
  // reset-password-form). `resolveInternalPath` rejects any off-origin target
  // (protocol-relative, backslash, absolute-URL, whitespace-smuggling variants)
  // and falls back to the dashboard — never hand-roll this check. We then drop
  // the gate itself as a target so success can't loop straight back here.
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("redirect");
    const safe = resolveInternalPath(target, ROUTES.customer.dashboard);
    if (safe !== ROUTES.customer.unlock) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount-time URL read, mirrors reset-password-form
      setRedirectTo(safe);
    }
  }, []);

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
      <Lock className="h-10 w-10 text-muted-foreground/40" />
      <div className="flex gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i} className="h-14 w-12 rounded-lg border-2 border-muted-foreground/20" />
        ))}
      </div>
      <div className="grid grid-cols-3 place-items-center gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-16 w-16 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
    </div>
  );
}
