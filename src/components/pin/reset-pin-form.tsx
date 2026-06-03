"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getClient } from "@/lib/supabase/client";
import { ROUTES } from "@/lib/constants";
import { PinService } from "@/services/pin";
import { PinSet } from "./pin-set";
import { PinNotice } from "./pin-notice";

/**
 * Landing page for the emailed PIN-reset link (`/reset-pin?token=...`). Public
 * and session-agnostic — the signed token (read server-side and passed in) is
 * the authorization. Visually identical to the unlock gate: the same card-less
 * PinSet and the shared PinNotice for terminal states.
 *
 * After the reset succeeds it attempts a seamless unlock: if the same browser
 * is signed in as this very parent, verifying the new PIN sets the unlock
 * cookie and lands them on the dashboard. Otherwise (the common
 * reset-on-your-phone case, or no session) we show a success notice pointing
 * back to sign-in.
 *
 * `tokenValid` is resolved server-side (the token is single-use; an expired or
 * already-used link is invalid). When it's false we show the "link expired"
 * notice straight away rather than prompting for a PIN — entering a PIN against
 * a dead token would otherwise come back as a confusing "PINs didn't match".
 */
export function ResetPinForm({
  token,
  tokenValid,
}: {
  token: string | null;
  tokenValid: boolean;
}) {
  const t = useTranslations("pin");
  const service = useMemo(() => new PinService(getClient()), []);
  const [done, setDone] = useState(false);
  // Covers the narrow race where the token was valid at page load but died
  // before submit (e.g. a parallel reset). Swaps to the same "expired" notice.
  const [expired, setExpired] = useState(false);

  const backToLogin = (
    <Button onClick={() => { window.location.href = ROUTES.login; }}>
      {t("reset.backToLogin")}
    </Button>
  );

  if (!token || !tokenValid || expired) {
    return (
      <PinNotice
        icon={<ShieldX className="h-12 w-12 text-destructive" />}
        title={t("reset.invalidTitle")}
        description={t("reset.invalidDescription")}
        action={backToLogin}
      />
    );
  }

  if (done) {
    return (
      <PinNotice
        icon={<ShieldCheck className="h-12 w-12 text-success" />}
        title={t("reset.successTitle")}
        description={t("reset.successDescription")}
        action={backToLogin}
      />
    );
  }

  return (
    <PinSet
      enterTitle={t("reset.enterTitle")}
      confirmTitle={t("reset.confirmTitle")}
      description={t("reset.description")}
      mismatchMessage={t("mismatch")}
      onSubmit={async (pin) => {
        try {
          await service.reset(token, pin);
        } catch {
          // The token was rejected at submit (expired/used between load and
          // now). Swap to the "link expired" notice — NOT a PIN-mismatch retry.
          setExpired(true);
          return true; // hold the disabled state through the view swap
        }
        // Seamless unlock when the reset happens in the same browser as a
        // locked session for this same parent.
        try {
          if (await service.verify(pin)) {
            window.location.href = ROUTES.customer.dashboard;
            return true;
          }
        } catch {
          // Not signed in as this parent here — show the success notice.
        }
        setDone(true);
        return true;
      }}
    />
  );
}
