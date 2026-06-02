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
 */
export function ResetPinForm({ token }: { token: string | null }) {
  const t = useTranslations("pin");
  const service = useMemo(() => new PinService(getClient()), []);
  const [done, setDone] = useState(false);

  const backToLogin = (
    <Button onClick={() => { window.location.href = ROUTES.login; }}>
      {t("reset.backToLogin")}
    </Button>
  );

  if (!token) {
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
        await service.reset(token, pin);
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
