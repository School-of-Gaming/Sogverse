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
import type { GeduContractAcceptance } from "@/types";

/**
 * The settings card's rendered core: the whole card, from one answer.
 *
 * Presentational end to end — it takes the row that answers the question and
 * nothing else — so the live settings page and the style guide render the same
 * card, one over a query and the other over fixtures. Which row answers is the
 * host's decision, not this component's: a gedu can hold several acceptances,
 * and picking the one that stands is domain logic about versions and languages
 * rather than anything to do with how the card looks.
 *
 * **Nothing here is reserved.** The heading and description are the same three
 * lines in every state and do not move; the body below them is empty, three
 * blocks or four, and that difference is the card's height difference. See the
 * data shell for why the settings page can afford it.
 */
export function GeduContractSettingsCardView({
  acceptance,
}: {
  /**
   * This gedu's acceptance of the version in force: the row when they have
   * signed it, `null` when they have not, and `undefined` while the answer is
   * still in flight.
   *
   * **`undefined` is the degraded path, not the ordinary one.** The settings
   * route prefetches the rows, so on an ordinary visit the card is handed an
   * answer before it first renders; this branch is reached only when that
   * server read failed and the browser is fetching the rows itself. It is also
   * what a failed *client* read leaves on screen, since the card has no
   * separate way to say so.
   */
  acceptance: GeduContractAcceptance | null | undefined;
}) {
  const t = useTranslations("gedu.contract.settings");
  const locale = useLocale();
  const timeZone = useTimezone();

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
