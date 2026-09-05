"use client";

import Link from "next/link";
import {
  ArrowRight,
  FileSignature,
  Scale,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { ROUTES } from "@/lib/constants";

/**
 * The band a gedu meets at the top of My SOG when something is still owed
 * before an admin can certify them — and the two things that can be.
 *
 * **Loud on purpose, and warning rather than destructive.** Nothing is broken
 * and nothing is taken away — neither the contract nor the record check gates
 * any permission the account holds — but neither is optional either, so the
 * band has to read as a thing still owed rather than as a thing gone wrong. The
 * attention register is what says that; the destructive one would claim a
 * failure that has not happened.
 *
 * **The whole band is the link.** It is one errand with one destination, so a
 * small target inside a large coloured box would be the only clickable part of
 * the loudest thing on the page. The arrow marks where it goes; it is not a
 * separate control.
 *
 * **One band at a time, and the contract comes first.** They are two steps of
 * one process in the order they happen — the terms are agreed to on the
 * platform, the extract is presented afterwards — and stacking both would put
 * two shouting boxes above a dashboard whose owner can only act on one of them
 * at a time. The page decides which; this file only owns how one looks.
 *
 * A band renders only while its step is outstanding, and disappears for good
 * once it is not — nothing survives that change into a different position, so
 * no space is held for it. The flags that decide them ride the page's own
 * server prefetch, so a band is in the first painted frame or in none: one that
 * arrived after paint would shove every section on the dashboard down.
 */
function GeduNextStepBand({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action: string;
}) {
  return (
    <div className="mx-auto mb-10 max-w-5xl">
      <Link
        href={ROUTES.gedu.contract}
        className="flex items-start gap-4 rounded-lg border-2 border-border bg-warning/10 p-5 transition-colors hover:bg-warning/20"
      >
        <Icon className="mt-0.5 h-6 w-6 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-lg font-bold text-warning">{title}</p>
          <p className="text-sm text-foreground">{body}</p>
          <p className="inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-warning">
            {action}
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          </p>
        </div>
      </Link>
    </div>
  );
}

/** Step one: the terms have not been accepted. */
export function GeduContractNotice() {
  const t = useTranslations("gedu.contract.notice");
  return (
    <GeduNextStepBand
      icon={FileSignature}
      title={t("title")}
      body={t("body")}
      action={t("action")}
    />
  );
}

/**
 * Step two: the terms are signed and no criminal record extract has been
 * recorded.
 *
 * It leads to the same place the contract band does, and that is deliberate
 * rather than a shortcut: there is nothing to *do* about the extract on the
 * platform — it is obtained from the Legal Register Centre and shown to us in
 * person — so what the educator needs is the explanation, and the explanation
 * lives on the contract page beside the other thing certification waits on.
 *
 * The scales are the check's one glyph everywhere it appears, so the band an
 * educator meets and the section it leads to are marked the same.
 */
export function GeduCriminalRecordCheckNotice() {
  const t = useTranslations("gedu.criminalRecordCheck.notice");
  return (
    <GeduNextStepBand
      icon={Scale}
      title={t("title")}
      body={t("body")}
      action={t("action")}
    />
  );
}
