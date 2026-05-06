"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Dead-end page shown after the call ends — either because a mod ended it
 * for everyone, or because Daily disconnected the participant for any
 * other reason after they were in-call.
 *
 * Intentionally has no "return home" or "create new room" CTA. The user is
 * done with this URL; they can navigate via browser tools if they want to
 * go elsewhere. The mission tagline gives the page a soft, branded close
 * instead of a cold "you've been disconnected."
 */
export function CallEndedScreen() {
  const t = useTranslations("voice.instant.ended");

  return (
    <div className="container mx-auto max-w-xl p-4 md:p-6">
      <Card>
        <CardContent className="space-y-4 py-12 text-center">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("body")}</p>
          <p className="pt-4 text-base font-medium text-primary">
            {t("mission")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
