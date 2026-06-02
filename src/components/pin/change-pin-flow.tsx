"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getClient } from "@/lib/supabase/client";
import { ROUTES } from "@/lib/constants";
import { PinService } from "@/services/pin";
import { PinSet } from "./pin-set";
import { PinNotice } from "./pin-notice";

/**
 * Authenticated "Change PIN" flow (`/parent/change-pin`), reached from the
 * settings security card. Just enter + confirm a new PIN — no current-PIN step,
 * the same way "Change Password" doesn't re-ask for the password: reaching this
 * page already required an unlocked session (the proxy gates /parent), and the
 * server re-checks that the session is unlocked before overwriting. A forgotten
 * PIN isn't handled here — that's the email reset at the gate.
 */
export function ChangePinFlow() {
  const t = useTranslations("pin");
  const router = useRouter();
  const service = useMemo(() => new PinService(getClient()), []);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <PinNotice
        icon={<ShieldCheck className="h-12 w-12 text-success" />}
        title={t("change.successTitle")}
        description={t("change.successDescription")}
        action={
          <Button onClick={() => router.push(ROUTES.settings)}>
            {t("change.backToSettings")}
          </Button>
        }
      />
    );
  }

  return (
    <PinSet
      enterTitle={t("change.newTitle")}
      confirmTitle={t("change.confirmTitle")}
      mismatchMessage={t("mismatch")}
      onSubmit={async (pin) => {
        await service.setPin(pin);
        setDone(true);
        return true;
      }}
      footer={
        <Link
          href={ROUTES.settings}
          className="flex items-center justify-center text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("change.cancel")}
        </Link>
      }
    />
  );
}
