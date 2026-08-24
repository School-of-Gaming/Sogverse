"use client";

import Link from "next/link";
import { ArrowRight, FileSignature } from "lucide-react";
import { useTranslations } from "next-intl";
import { ROUTES } from "@/lib/constants";

/**
 * The band a gedu who has not accepted the contract in force meets at the top
 * of My SOG.
 *
 * **Loud on purpose, and warning rather than destructive.** Nothing is broken
 * and nothing is taken away — acceptance gates no permission the account holds
 * — but signing is not optional either, so the band has to read as a thing
 * still owed rather than as a thing gone wrong. The attention register is what
 * says that; the destructive one would claim a failure that has not happened.
 *
 * **The whole band is the link.** It is one errand with one destination, so a
 * small target inside a large coloured box would be the only clickable part of
 * the loudest thing on the page. The arrow marks where it goes; it is not a
 * separate control.
 *
 * It renders only while the contract is unsigned, and disappears for good once
 * it is not — nothing survives that change into a different position, so no
 * space is held for it. The flag that decides it rides the page's own server
 * prefetch, so the band is in the first painted frame or in none: a band that
 * arrived after paint would shove every section on the dashboard down.
 */
export function GeduContractNotice() {
  const t = useTranslations("gedu.contract.notice");
  return (
    <div className="mx-auto mb-10 max-w-5xl">
      <Link
        href={ROUTES.gedu.contract}
        className="flex items-start gap-4 rounded-lg border-2 border-warning/60 bg-warning/10 p-5 transition-colors hover:bg-warning/20"
      >
        <FileSignature
          className="mt-0.5 h-6 w-6 shrink-0 text-warning"
          aria-hidden
        />
        <div className="min-w-0 space-y-1">
          <p className="text-lg font-bold text-warning">{t("title")}</p>
          <p className="text-sm text-foreground">{t("body")}</p>
          <p className="inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-warning">
            {t("action")}
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          </p>
        </div>
      </Link>
    </div>
  );
}
