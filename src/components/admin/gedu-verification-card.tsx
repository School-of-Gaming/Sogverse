"use client";

/**
 * Admin control to certify / de-certify a gedu, shown on the gedu's
 * /admin/users/[id] page. A self-registered gedu starts uncertified and can't be
 * assigned to a product group until an admin certifies them here (the assignment
 * picker greys out uncertified gedus).
 *
 * Seeded with a server-fetched `initial` row so it paints complete on first
 * frame; the mutation invalidates the query so the stamped certified_at / admin
 * refresh after a toggle.
 *
 * The component, its file and its `admin.users.verification.*` message keys still
 * say "verification" — the DB and the data layer were renamed to "certified"
 * first, and the user-facing copy follows in its own change.
 */

import { useState } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGeduProfile, useSetGeduCertified, type GeduCertification } from "@/services/gedu";
import { useTimezone } from "@/providers";
import { formatDate } from "@/lib/utils";

interface GeduVerificationCardProps {
  geduId: string;
  initial: GeduCertification | null;
}

export function GeduVerificationCard({ geduId, initial }: GeduVerificationCardProps) {
  const t = useTranslations("admin.users.verification");
  const locale = useLocale();
  const timeZone = useTimezone();
  const { data } = useGeduProfile(geduId, { initialData: initial });
  const setCertified = useSetGeduCertified();
  const [committing, setCommitting] = useState(false);

  const certified = data?.certified ?? false;
  const certifierName = data?.certifier
    ? [data.certifier.first_name, data.certifier.last_name].filter(Boolean).join(" ")
    : null;

  async function handleToggle() {
    // Set busy synchronously before the await so the button can't be
    // double-clicked while the mutation is in flight.
    setCommitting(true);
    try {
      await setCertified.mutateAsync({ geduId, certified: !certified });
    } finally {
      setCommitting(false);
    }
  }

  const busy = committing || setCertified.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {certified ? (
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
            {certified ? (
              <Badge className="bg-success text-success-foreground">{t("verified")}</Badge>
            ) : (
              <Badge variant="destructive">{t("unverified")}</Badge>
            )}
            {certified && data?.certified_at ? (
              <p className="text-sm text-muted-foreground">
                {certifierName
                  ? t("verifiedByOn", {
                      name: certifierName,
                      date: formatDate(data.certified_at, locale, { dateStyle: "medium", timeZone }),
                    })
                  : t("verifiedOn", {
                      date: formatDate(data.certified_at, locale, { dateStyle: "medium", timeZone }),
                    })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("unverifiedNote")}</p>
            )}
          </div>
          <Button
            variant={certified ? "outline" : "default"}
            onClick={handleToggle}
            disabled={busy}
          >
            {busy ? t("saving") : certified ? t("unverifyAction") : t("verifyAction")}
          </Button>
        </div>
        {setCertified.isError && (
          <p className="text-sm text-destructive">
            {setCertified.error instanceof Error ? setCertified.error.message : t("error")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
