"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";

export type EndReason =
  /** The user clicked Leave themselves; the room is still open for others. */
  | "left"
  /** The call ended for everyone — mod ended it, room expired, or the
   *  participant got disconnected for any other non-user reason. */
  | "ended";

interface CallEndedScreenProps {
  reason: EndReason;
}

/**
 * Dead-end page shown after the call wraps up for the participant.
 *
 * Two variants because the framing differs: "you left" is reassuring
 * ("come back any time") while "call ended" is a hard close. Both
 * share the brand mission tagline as a soft outro instead of a bare
 * "you've been disconnected."
 */
export function CallEndedScreen({ reason }: CallEndedScreenProps) {
  const t = useTranslations(`voice.instant.${reason}`);

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
