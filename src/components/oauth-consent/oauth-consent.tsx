"use client";

import { useState } from "react";
import { Bot, Loader2, ShieldX, TimerOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { parseJsonResponse } from "@/lib/api/json-response";
import type { RedirectDestination } from "@/lib/oauth-consent";
import {
  oauthConsentResponse,
  type OAuthConsentBody,
} from "@/services/oauth-consent/oauth-consent.contracts";

interface OAuthConsentProps {
  authorizationId: string;
  /** The name the client registered itself under — its own claim, unverified. */
  clientName: string;
  destination: RedirectDestination;
  /** The admin the grant will act as. */
  email: string;
}

/**
 * The question an admin answers when an AI app asks to act as them through the
 * MCP endpoint: Allow or Deny.
 *
 * **The destination leads, not the name.** Registration is open, so the name is
 * whatever the client typed; the host the code is sent to is the one thing a
 * phishing client cannot choose for itself without receiving the code there.
 * An unrecognised destination gets the warning, and still works.
 *
 * Both answers leave the page: Supabase hands back the AI app's address with
 * the code or the refusal on it, and the browser goes there with a full
 * navigation. So the latch is set before the request and released only on a
 * failure, which is the one outcome that leaves the reader here.
 */
export function OAuthConsent({
  authorizationId,
  clientName,
  destination,
  email,
}: OAuthConsentProps) {
  const t = useTranslations("oauthConsent");
  const [committing, setCommitting] = useState<OAuthConsentBody["decision"] | null>(
    null,
  );
  const [failed, setFailed] = useState(false);

  async function answer(decision: OAuthConsentBody["decision"]) {
    setCommitting(decision);
    setFailed(false);
    try {
      const response = await fetch("/api/oauth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorizationId, decision } satisfies OAuthConsentBody),
      });
      if (!response.ok) throw new Error(String(response.status));
      const { redirectUrl } = await parseJsonResponse(response, oauthConsentResponse);
      // The document unloads on the way to the AI app; the latch stays set.
      window.location.href = redirectUrl;
    } catch {
      setFailed(true);
      setCommitting(null);
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
      <Bot className="h-12 w-12 text-act" aria-hidden />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("body", { clientName })}</p>
      </div>

      <div className="w-full space-y-1">
        <p className="text-sm text-muted-foreground">{t("destinationLabel")}</p>
        <p className="break-all text-xl font-bold">{destination.display}</p>
        {destination.loopback ? (
          <p className="text-sm text-muted-foreground">{t("loopbackHint")}</p>
        ) : null}
      </div>

      {destination.recognised ? null : (
        <Alert variant="warning" className="text-left">
          <AlertDescription>{t("unrecognised")}</AlertDescription>
        </Alert>
      )}

      <p className="text-sm text-muted-foreground">{t("signedInAs", { email })}</p>

      {failed ? (
        <Alert variant="destructive" className="text-left">
          <AlertDescription>{t("failed")}</AlertDescription>
        </Alert>
      ) : null}

      {/* The app-wide order: the affirmative is authored last, so it sits on
          the right in a row and on top in a stack. */}
      <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          disabled={committing !== null}
          onClick={() => void answer("deny")}
        >
          {committing === "deny" ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {t("deny")}
        </Button>
        <Button disabled={committing !== null} onClick={() => void answer("approve")}>
          {committing === "approve" ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : null}
          {t("allow")}
        </Button>
      </div>
    </div>
  );
}

/**
 * A request the page cannot answer: no id, an id already answered or expired,
 * or one Supabase would not describe. Each sign-in link works once, so the only
 * way on is a fresh one from the AI app.
 */
export function OAuthConsentUnavailable() {
  const t = useTranslations("oauthConsent.unavailable");
  return (
    <Outcome
      icon={<TimerOff className="h-12 w-12 text-muted-foreground" aria-hidden />}
      title={t("title")}
      body={t("body")}
    />
  );
}

/** Anyone but an admin, refused before the authorization is so much as read. */
export function OAuthConsentRefused({ email }: { email: string }) {
  const t = useTranslations("oauthConsent.refused");
  return (
    <Outcome
      icon={<ShieldX className="h-12 w-12 text-muted-foreground" aria-hidden />}
      title={t("title")}
      body={t("body", { email })}
    />
  );
}

function Outcome({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      {icon}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
