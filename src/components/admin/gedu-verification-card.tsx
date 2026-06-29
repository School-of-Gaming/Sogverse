"use client";

/**
 * Admin control to verify / un-verify a gedu, shown on the gedu's
 * /admin/users/[id] page. A self-registered gedu starts unverified and can't be
 * assigned to a product group until an admin verifies them here (the assignment
 * picker greys out unverified gedus).
 *
 * Seeded with a server-fetched `initial` row so it paints complete on first
 * frame; the mutation invalidates the query so the stamped verified_at / admin
 * refresh after a toggle.
 */

import { useState } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGeduProfile, useSetGeduVerified, type GeduVerification } from "@/services/gedu";
import { useTimezone } from "@/providers";
import { formatDate } from "@/lib/utils";

interface GeduVerificationCardProps {
  geduId: string;
  initial: GeduVerification | null;
}

export function GeduVerificationCard({ geduId, initial }: GeduVerificationCardProps) {
  const t = useTranslations("admin.users.verification");
  const locale = useLocale();
  const timeZone = useTimezone();
  const { data } = useGeduProfile(geduId, { initialData: initial });
  const setVerified = useSetGeduVerified();
  const [committing, setCommitting] = useState(false);

  const verified = data?.verified ?? false;
  const verifierName = data?.verifier
    ? [data.verifier.first_name, data.verifier.last_name].filter(Boolean).join(" ")
    : null;

  async function handleToggle() {
    // Set busy synchronously before the await so the button can't be
    // double-clicked while the mutation is in flight.
    setCommitting(true);
    try {
      await setVerified.mutateAsync({ geduId, verified: !verified });
    } finally {
      setCommitting(false);
    }
  }

  const busy = committing || setVerified.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {verified ? (
            <CheckCircle2 className="h-5 w-5 text-success" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-warning" />
          )}
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            {verified ? (
              <Badge className="bg-success text-success-foreground">{t("verified")}</Badge>
            ) : (
              <Badge variant="destructive">{t("unverified")}</Badge>
            )}
            {verified && data?.verified_at ? (
              <p className="text-sm text-muted-foreground">
                {verifierName
                  ? t("verifiedByOn", {
                      name: verifierName,
                      date: formatDate(data.verified_at, locale, { dateStyle: "medium", timeZone }),
                    })
                  : t("verifiedOn", {
                      date: formatDate(data.verified_at, locale, { dateStyle: "medium", timeZone }),
                    })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("unverifiedNote")}</p>
            )}
          </div>
          <Button
            variant={verified ? "outline" : "default"}
            onClick={handleToggle}
            disabled={busy}
          >
            {busy ? t("saving") : verified ? t("unverifyAction") : t("verifyAction")}
          </Button>
        </div>
        {setVerified.isError && (
          <p className="text-sm text-destructive">
            {setVerified.error instanceof Error ? setVerified.error.message : t("error")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
