"use client";

import Link from "next/link";
import { BadgeCheck, FileSignature, ScrollText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import { useGeduContractAcceptances } from "@/services/gedu";
import { GEDU_CONTRACT_CURRENT_VERSION } from "./documents";

/**
 * The gedu's own standing under the contract, on the settings page: what they
 * signed and when, or that they have not.
 *
 * **A summary and a way back to the document, never a second place to sign.**
 * The signing ceremony belongs on the page that shows the terms, because a
 * signature given anywhere else is a signature given without the text in front
 * of it. Both states link to the same page; only the invitation differs.
 *
 * The read is a keyed lookup of a bounded set — at most one row per version
 * ever published — so it lands in a frame or two and gets **no** loading
 * affordance at all: the card's heading and description are there from the
 * first paint and the body is simply empty until the answer arrives.
 *
 * **Nothing is reserved for it, because the card is last on the settings
 * page.** The heading above the body does not move whatever lands in it, and
 * there is nothing below to be pushed down — so a slot held open at the taller
 * of the two states would buy no stability and cost a visible hole in the
 * shorter one. The placement is what makes that true; see the settings page.
 */
export function GeduContractSettingsCard({ geduId }: { geduId: string }) {
  const t = useTranslations("gedu.contract.settings");
  const locale = useLocale();
  const timeZone = useTimezone();

  const { data: acceptances } = useGeduContractAcceptances(geduId);
  const acceptance =
    acceptances === undefined
      ? undefined
      : (acceptances.find(
          (row) => row.contract_version === GEDU_CONTRACT_CURRENT_VERSION,
        ) ?? null);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5" />
          <CardTitle>{t("title")}</CardTitle>
        </div>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {acceptance === undefined ? null : acceptance === null ? (
            <>
              <p className="font-medium text-warning">{t("notAcceptedTitle")}</p>
              <p className="text-sm text-muted-foreground">
                {t("notAcceptedBody")}
              </p>
              <Link
                href={ROUTES.gedu.contract}
                className={buttonVariants({ variant: "default" })}
              >
                <FileSignature className="h-4 w-4" />
                {t("readAndAccept")}
              </Link>
            </>
          ) : (
            <>
              <p className="flex items-center gap-2 font-medium text-success">
                <BadgeCheck className="h-5 w-5 shrink-0" aria-hidden />
                {t("acceptedTitle")}
              </p>
              {/* The name as it was signed, on its own line — the same
                  handwriting the signing dialog drew it in. */}
              <p className="font-cursive text-2xl leading-none">
                {acceptance.signed_name}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("acceptedDetail", {
                  version: acceptance.contract_version,
                  date: formatDate(acceptance.accepted_at, locale, {
                    dateStyle: "long",
                    timeZone,
                  }),
                })}
              </p>
              <Link
                href={ROUTES.gedu.contract}
                className={buttonVariants({ variant: "outline" })}
              >
                {t("view")}
              </Link>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
