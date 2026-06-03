"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getClient } from "@/lib/supabase/client";
import { PinService } from "@/services/pin";
import { PinEntry } from "./pin-entry";
import { PinSet } from "./pin-set";
import { PinNotice } from "./pin-notice";

interface PinUnlockFlowProps {
  /**
   * Whether a PIN already exists — picks the branch:
   *   false → create one (enter + confirm).
   *   true  → enter it to unlock; a "forgot" link emails a reset.
   */
  pinIsSet: boolean;
  /**
   * Called once the session is unlocked — the PIN was created or verified and
   * the unlock cookie is now set. The caller decides what "unlocked" means:
   * a full-page navigation (the `/parent/unlock` page) or an in-place view swap
   * (the Add Gamer dialog). Either way it must unmount this component, which is
   * what holds the pad's disabled state through the transition (the pad keeps
   * `busy` set after a successful submit by design).
   */
  onUnlocked: () => void;
}

/**
 * The parent-PIN create/enter/forgot UI, with no opinion on what happens after
 * unlock. Shared by the full-page lock gate (`UnlockGate`) and any in-place gate
 * (the Add Gamer dialog) so there's one source of truth for the pad screens and
 * the forgot-PIN email flow. Render it centered inside whatever shell you like.
 */
export function PinUnlockFlow({ pinIsSet, onUnlocked }: PinUnlockFlowProps) {
  const t = useTranslations("pin");
  const service = useMemo(() => new PinService(getClient()), []);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);

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
          onUnlocked();
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
      // The route succeeds silently by design — nothing actionable to surface.
      // Re-enable so they can try again.
      setForgotBusy(false);
    }
  }

  return (
    <PinEntry
      title={t("unlock.title")}
      description={t("unlock.description")}
      onSubmit={async (pin) => {
        const ok = await service.verify(pin);
        if (ok) onUnlocked();
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
