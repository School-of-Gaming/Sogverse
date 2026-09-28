"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import {
  LEDGER_ROW_INSET,
  LedgerSummaryLine,
} from "@/components/invoicing-ledger/ledger";
import {
  MonthStepper,
  type MonthHref,
} from "@/components/invoicing-ledger/month-stepper";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { cn, formatCurrencyFromCents } from "@/lib/utils";
import { useNow } from "@/providers";
import {
  useMyGeduInvoicingMonth,
  type GeduInvoicingSnapshot,
} from "@/services/gedu-invoicing";
import { buildGeduInvoicing, type GeduInvoice } from "./build-gedu-invoicing";
import { GeduClubTable } from "./gedu-invoicing-clubs";

/**
 * **Gedu invoicing, the gedu's own read** — the month they invoice School of
 * Gaming for.
 *
 * The same build as the admin's page over the same document shape, narrowed by
 * the database to the calling gedu's own seats, and drawn from the same club
 * table. Where the two differ is what the reader is doing: an admin checks
 * everybody's month, and a gedu copies two sums onto an invoice. So this page
 * leads with those two sums — municipality and consumer, which the Gedu
 * handbook asks to be itemised apart — and says the one thing the figures
 * cannot: they exclude VAT, which the gedu adds on their invoice.
 *
 * Nothing on it links into an admin page, and it says nothing about unset fees:
 * setting a fee is an admin's task, done before a gedu invoices.
 */
export function MyGeduInvoicingPage({
  monthStart,
  initialSnapshot,
  now: pinnedNow,
  monthHref = geduMonthHref,
}: {
  /** The month on screen, as its first day (`YYYY-MM-01`). */
  monthStart: string;
  initialSnapshot: GeduInvoicingSnapshot;
  /** A pinned clock — only the preview scene passes one. */
  now?: Date;
  /** Where a step of the month stepper goes; the scene points it at itself. */
  monthHref?: (month: string) => MonthHref;
}) {
  const t = useTranslations("geduInvoicing");
  const locale = resolveLocale(useLocale());
  const liveNow = useNow();
  const now = pinnedNow ?? liveNow;
  const { data: snapshot } = useMyGeduInvoicingMonth(
    monthStart,
    initialSnapshot,
  );

  const invoice = useMemo(
    () => buildGeduInvoicing({ snapshot, locale, now }),
    [snapshot, locale, now],
  );
  // The gedu's own read carries the caller alone, or nobody in a month with
  // nothing in it.
  const gedu = invoice.gedus.at(0);

  return (
    // Reserved for the same reason as the admin ledger: opening a club's dates
    // is what puts the page over the fold.
    <div className="mx-auto max-w-5xl space-y-6 pb-24" data-reserve-scroll-gutter>
      <MyGeduInvoicingHeading />

      <MonthStepper
        monthStart={invoice.monthStart}
        locale={locale}
        monthHref={monthHref}
        previousLabel={t("previousMonth")}
        nextLabel={t("nextMonth")}
      />

      {gedu === undefined ? (
        <p className="text-sm text-muted-foreground">{t("myEmptyMonth")}</p>
      ) : (
        // Keyed by month so each club's open state starts afresh on a step:
        // the clubs of April are not the clubs of May, even where they share
        // a name.
        <MyMonth key={invoice.monthStart} gedu={gedu} locale={locale} />
      )}
    </div>
  );
}

/** The live page's own answer: another month of this route. */
function geduMonthHref(month: string): MonthHref {
  return { pathname: ROUTES.gedu.invoicing, query: { month } };
}

/**
 * The way back, the title and what the page is — the part that waits on
 * nothing, and the part the route renders above a failed read too.
 */
export function MyGeduInvoicingHeading() {
  const t = useTranslations("geduInvoicing");

  return (
    <div className="space-y-6">
      {/* The way back, because this page is reached from the account menu and
          is not a place on the strip. */}
      <Link
        href={ROUTES.gedu.dashboard}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("backToDashboard")}
      </Link>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{t("myTitle")}</h1>
        <p className="text-muted-foreground">{t("myDescription")}</p>
      </div>
    </div>
  );
}

/**
 * One month of one gedu: the sums that go on the invoice, then the clubs and
 * dates they come from, on one card and one money axis.
 */
function MyMonth({ gedu, locale }: { gedu: GeduInvoice; locale: string }) {
  const t = useTranslations("geduInvoicing");

  return (
    <Card className="overflow-hidden">
      {/* The two sums the invoice itemises, then their total — each ending on
          the same right inset the club totals below end on. */}
      <div className="divide-y divide-border">
        <SumLine
          label={t("segmentMunicipality")}
          figure={formatCurrencyFromCents(
            gedu.municipalityTotalCents,
            "eur",
            locale,
          )}
        />
        <SumLine
          label={t("segmentConsumer")}
          figure={formatCurrencyFromCents(gedu.consumerTotalCents, "eur", locale)}
        />
        <LedgerSummaryLine
          facts={t("sessionCount", { count: gedu.paidCount })}
          caption={t("myTotal")}
          figure={formatCurrencyFromCents(gedu.totalCents, "eur", locale)}
        />
      </div>

      <div className={cn("space-y-1 pb-2.5 text-xs", LEDGER_ROW_INSET)}>
        <p className="text-muted-foreground">{t("vatNote")}</p>
        <p className="text-muted-foreground">{t("itemiseNote")}</p>
        {/* A sentence of its own rather than a warning phrase on a count line,
            as the admin reads it: a gedu has to know what to do about it, not
            only that it happened. */}
        {gedu.unrecordedCount > 0 && (
          <p className="font-medium text-warning">
            {t("myUnrecorded", { count: gedu.unrecordedCount })}
          </p>
        )}
      </div>

      <div
        className={cn(
          "overflow-x-auto border-t border-border pb-1",
          LEDGER_ROW_INSET,
        )}
      >
        <GeduClubTable
          gedu={gedu}
          locale={locale}
          audience="gedu"
          clubsStartOpen
        />
      </div>
    </Card>
  );
}

/** One of the two itemised sums: its name on the left, the figure on the axis. */
function SumLine({ label, figure }: { label: string; figure: string }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-2.5 text-sm",
        LEDGER_ROW_INSET,
      )}
    >
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{figure}</span>
    </div>
  );
}
