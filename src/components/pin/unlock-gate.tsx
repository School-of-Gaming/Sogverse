"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getClient } from "@/lib/supabase/client";
import { ROUTES } from "@/lib/constants";
import { PinService, usePinIsSet } from "@/services/pin";
import { PinEntry } from "./pin-entry";
import { PinSet } from "./pin-set";
import { PinNotice } from "./pin-notice";

/**
 * The parent lock gate (`/parent/unlock`). A locked customer is redirected here
 * by the proxy from any non-exempt route. Two branches:
 *   - No PIN yet  → create one (enter + confirm), then continue.
 *   - PIN set     → enter it to unlock; a "forgot" link emails a reset.
 *
 * On success it does a full-page navigation to the original destination so the
 * proxy re-runs and sees the fresh unlock cookie. The "Use a different profile"
 * link is the escape hatch for anyone who isn't the parent (a child can drop
 * back to their own gamer account from /select-profile).
 */
export function UnlockGate({ initialPinIsSet }: { initialPinIsSet?: boolean }) {
  const t = useTranslations("pin");
  const { data: pinIsSet } = usePinIsSet(initialPinIsSet);
  const service = useMemo(() => new PinService(getClient()), []);

  const [redirectTo, setRedirectTo] = useState<string>(ROUTES.customer.dashboard);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);

  // Read ?redirect= from the URL once on mount (window.location, not
  // useSearchParams, to avoid forcing a Suspense boundary — same approach as
  // reset-password-form). Only accept a same-origin path, and never the gate
  // itself (would loop).
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("redirect");
    if (
      target &&
      target.startsWith("/") &&
      !target.startsWith("//") &&
      target !== ROUTES.customer.unlock
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount-time URL read, mirrors reset-password-form
      setRedirectTo(target);
    }
  }, []);

  // Normally `pinIsSet` is seeded server-side, so this never shows. It only
  // appears in the degraded path where the server prefetch came back undefined
  // and the client query is still in flight.
  if (pinIsSet === undefined) {
    return <UnlockSkeleton />;
  }

  if (forgotSent) {
    return (
      <PinNotice
        icon={<MailCheck className="h-12 w-12 text-primary" />}
        title={t("forgotSent.title")}
        description={t("forgotSent.description")}
        action={
          <Button variant="outline" onClick={() => setForgotSent(false)}>
            {t("forgotSent.back")}
          </Button>
        }
      />
    );
  }

  if (!pinIsSet) {
    return (
      <PinSet
        enterTitle={t("create.enterTitle")}
        confirmTitle={t("create.confirmTitle")}
        description={t("create.description")}
        mismatchMessage={t("mismatch")}
        onSubmit={async (pin) => {
          await service.setPin(pin);
          window.location.href = redirectTo;
          return true;
        }}
      />
    );
  }

  async function handleForgot() {
    if (forgotBusy) return;
    setForgotBusy(true);
    try {
      await service.forgot();
      setForgotSent(true);
    } catch {
      // Surface nothing actionable here — the route succeeds silently by
      // design. Re-enable so they can try again.
      setForgotBusy(false);
    }
  }

  return (
    <PinEntry
      title={t("unlock.title")}
      description={t("unlock.description")}
      onSubmit={async (pin) => {
        const ok = await service.verify(pin);
        if (ok) window.location.href = redirectTo;
        return ok;
      }}
      footer={
        <Button
          variant="link"
          className="h-auto p-0"
          onClick={handleForgot}
          disabled={forgotBusy}
        >
          {t("unlock.forgot")}
        </Button>
      }
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
