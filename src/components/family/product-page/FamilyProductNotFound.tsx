"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import type { SessionAudience } from "@/types";
import { FamilyProductBackLink } from "./BackLink";

/**
 * What a family gets when the page behind this URL cannot be shown.
 *
 * **Three different situations, one answer, and that is the settled decision.**
 * The read refuses a participation that is not the caller's (which is also what
 * a participation id that does not exist looks like, deliberately — an error
 * that told them apart would answer "does this id exist" for any id anyone
 * cared to try), and it refuses one that is genuinely theirs but has not been
 * placed in a group yet. The service keeps those two apart because the
 * distinction is real and cheap to carry; this surface collapses them, because
 * a family has nothing to *do* with either answer and there is no version of
 * "you may not read this" worth showing somebody who did not choose to ask.
 *
 * A read that has genuinely failed — after React Query has exhausted its
 * retries — lands here too. That is a small imprecision accepted on purpose: at
 * that point there is nothing to render either way, and a third state would be
 * copy telling a parent about our network rather than about their child.
 *
 * The copy names no child and blames nobody. It says the page is not there and
 * points at My SOG, which is the one place that definitely lists everything
 * this reader is actually enrolled in — the same sentence serving a parent and
 * a child, because "this page isn't available" is not a fact either of them
 * meets differently.
 */
export function FamilyProductNotFound({
  audience,
}: {
  audience: SessionAudience;
}) {
  const t = useTranslations("familyProduct");

  return (
    <div className="mx-auto max-w-3xl py-6 sm:py-10">
      <FamilyProductBackLink audience={audience} />
      <Card className="mt-6">
        <CardContent className="p-8 text-center">
          <h2 className="text-base font-semibold">{t("notFoundTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("notFoundBody")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
