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
 * **"Certified", never "verified".** The two words name different things on this
 * platform: certification is an admin's judgement about a person, and
 * verification is a claim about an email address that its own recipient
 * confirmed. They can appear on the same account and mean nothing about each
 * other.
 */

import { useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGeduProfile, useSetGeduCertified, type GeduCertification } from "@/services/gedu";
import { useTimezone } from "@/providers";
import { formatDate } from "@/lib/utils";

interface GeduCertificationCardProps {
  geduId: string;
  initial: GeduCertification | null;
}

export function GeduCertificationCard({ geduId, initial }: GeduCertificationCardProps) {
  const t = useTranslations("admin.users.certification");
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
          {/* The same mark the users list puts on a certified gedu, so one
              concept has one glyph across the admin surfaces — and pointedly not
              the green check, which now belongs to email verification. */}
          {certified ? (
            <ShieldCheck className="h-5 w-5 text-success" />
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
              <Badge className="bg-success text-success-foreground">{t("certified")}</Badge>
            ) : (
              <Badge variant="destructive">{t("notCertified")}</Badge>
            )}
            {certified && data?.certified_at ? (
              <p className="text-sm text-muted-foreground">
                {certifierName
                  ? t("certifiedByOn", {
                      name: certifierName,
                      date: formatDate(data.certified_at, locale, { dateStyle: "medium", timeZone }),
                    })
                  : t("certifiedOn", {
                      date: formatDate(data.certified_at, locale, { dateStyle: "medium", timeZone }),
                    })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("notCertifiedNote")}</p>
            )}
          </div>
          <Button
            variant={certified ? "outline" : "default"}
            onClick={handleToggle}
            disabled={busy}
          >
            {busy ? t("saving") : certified ? t("uncertifyAction") : t("certifyAction")}
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
