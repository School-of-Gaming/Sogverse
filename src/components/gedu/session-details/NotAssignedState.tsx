"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { SessionDetailsBackLink } from "@/components/group-workspace/BackLink";

/**
 * The page frame around the "this isn't your product" answer — what both
 * workspace shells render when the caller holds no seat of their kind here.
 */
export function NotAssignedState() {
  const t = useTranslations("gedu.sessionDetails");
  return (
    <div className="mx-auto max-w-7xl py-6 sm:py-10">
      <SessionDetailsBackLink />
      <Card className="mt-6">
        <CardContent className="p-8 text-center">
          <h2 className="text-base font-semibold">{t("notAssignedTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("notAssignedBody")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
