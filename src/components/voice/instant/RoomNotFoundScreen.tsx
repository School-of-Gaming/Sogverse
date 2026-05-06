"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/providers";
import { ROUTES } from "@/lib/constants";

interface RoomNotFoundScreenProps {
  /** The code the user actually entered, echoed back so they can spot typos. */
  code: string;
}

/**
 * Shown when the requested room code doesn't resolve to a Daily.co room.
 *
 * Three things collapse to this state — the code never existed, the code
 * was a typo, or the room ended/expired. We don't try to distinguish them
 * (we'd need our own DB to track ended rooms) and the UX is the same in all
 * three cases: echo the entered code so the user can verify it character by
 * character, and offer admins/gedus a shortcut to spin up a fresh room.
 */
export function RoomNotFoundScreen({ code }: RoomNotFoundScreenProps) {
  const t = useTranslations("voice.instant.notFound");
  const { profile } = useAuth();
  const isMod = profile?.role === "admin" || profile?.role === "gedu";
  const newRoomHref =
    profile?.role === "gedu" ? ROUTES.gedu.voice : ROUTES.admin.voice;

  return (
    <div className="container mx-auto max-w-xl p-4 md:p-6">
      <Card>
        <CardContent className="space-y-6 py-12 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("body")}</p>
          </div>

          <div className="rounded-md border border-border bg-muted/40 px-4 py-3 font-mono text-2xl font-bold tracking-[0.3em]">
            {code}
          </div>

          <p className="text-sm text-muted-foreground">{t("hint")}</p>

          {isMod && (
            <div className="pt-2">
              <Button asChild>
                <Link href={newRoomHref}>{t("createNew")}</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
