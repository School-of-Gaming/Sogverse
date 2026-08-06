"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { ROUTES } from "@/lib/constants";
import type { SessionAudience } from "@/types";

/**
 * The way back off a family product page, to whichever My SOG the reader came
 * from.
 *
 * Its own component because **it is the one thing on this page that survives
 * every state the route can be in**. The skeleton renders it, the not-found
 * card renders it, and the finished page renders it — on the same pixel each
 * time, since all three sit in the same container at the same offset. A reader
 * who lands on a slow load and reaches for it does not have it move out from
 * under them when the data arrives, and a reader who lands on a refusal is not
 * stranded on a page with no way off it.
 *
 * "My SOG" rather than "dashboard", in the copy and in the thinking: the word
 * the families see is the name of the place they are going back to.
 */
export function FamilyProductBackLink({
  audience,
}: {
  audience: SessionAudience;
}) {
  const t = useTranslations("familyProduct");

  return (
    <Link
      href={
        audience === "customer"
          ? ROUTES.customer.dashboard
          : ROUTES.gamer.dashboard
      }
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {t("back")}
    </Link>
  );
}
