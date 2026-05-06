"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { RoomLinkChip } from "./RoomLinkChip";

export type EndReason =
  /** The user clicked Leave themselves; the room is still open for others. */
  | "left"
  /** The call ended for everyone — mod ended it, room expired, or the
   *  participant got disconnected for any other non-user reason. */
  | "ended";

interface CallEndedScreenProps {
  reason: EndReason;
  /** Room code for the URL chip rendered on the "left" variant so the
   *  user can copy the link to come back. */
  code: string;
  /** Pre-rendered `<Copyright />` from the server boundary above. Threaded
   *  in as a slot rather than imported here so the year computation stays
   *  on the server (avoids hydration mismatch at year boundaries). */
  copyright: ReactNode;
}

/**
 * Dead-end page shown after the call wraps up for the participant.
 *
 * Two variants because the framing differs: "you left" is reassuring
 * ("come back any time" with the same URL chip the mod sees on creation)
 * while "call ended" is a hard close. Both close with the brand tagline
 * styled the same way as the home-page hero — `home.hero.title` is reused
 * directly so the typography and colour treatment stay in sync if either
 * the copy or palette changes later. A small copyright line sits below
 * the tagline as a footer; this is the only voice screen that carries
 * one.
 */
export function CallEndedScreen({ reason, code, copyright }: CallEndedScreenProps) {
  const t = useTranslations(`voice.instant.${reason}`);
  const tHome = useTranslations("home.hero");

  return (
    <div className="container mx-auto max-w-xl p-4 md:p-6">
      <Card>
        <CardContent className="space-y-4 py-12 text-center">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("body")}</p>
          {reason === "left" && (
            <div className="flex justify-center pt-2">
              <RoomLinkChip code={code} />
            </div>
          )}
          <h2 className="pt-6 font-display text-2xl font-bold leading-tight tracking-tight md:text-3xl">
            {tHome.rich("title", {
              br: () => <br />,
              primary: (chunks) => (
                <span className="text-primary">{chunks}</span>
              ),
              secondary: (chunks) => (
                <span className="text-secondary">{chunks}</span>
              ),
            })}
          </h2>
          <div className="pt-6">{copyright}</div>
        </CardContent>
      </Card>
    </div>
  );
}
