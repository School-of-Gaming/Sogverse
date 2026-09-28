"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CountLine,
  CountLineWarning,
  LEDGER_ROW_INSET,
  LedgerSection,
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
  useAdminGeduInvoicingMonth,
  type GeduInvoicingSnapshot,
} from "@/services/gedu-invoicing";
import {
  buildGeduInvoicing,
  type GeduInvoice,
  type GeduInvoicingView,
} from "./build-gedu-invoicing";
import { filterGeduInvoices } from "./filter-gedu-invoices";
import { GeduClubTable, fullName } from "./gedu-invoicing-clubs";

/**
 * **Gedu invoicing, the admin's read** — one month, every gedu.
 *
 * What each gedu invoices School of Gaming for, recomputed from today's facts
 * every time it is read: nothing here writes, snapshots or exports anything.
 * The shell owns the month the URL names, the clock, the reader's locale, the
 * search and which gedus are open; everything else is one pure build over the document the
 * route already fetched, which is why there is no loading state below this line.
 *
 * It is the municipality ledger's shape turned to the other side of the money —
 * one card, a summary line, one closed line per gedu, a club table under each —
 * and it is drawn from the same ledger parts, so the two read alike.
 *
 * The search narrows the list of gedus, never the month: the summary line
 * states the whole month whatever is typed, and expand-all acts on the gedus
 * the search left. The query outlives a step to another month, because the
 * reader stepping through months is usually following one gedu.
 */
export function AdminGeduInvoicingPage({
  monthStart,
  initialSnapshot,
  now: pinnedNow,
  monthHref = adminMonthHref,
}: {
  /** The month on screen, as its first day (`YYYY-MM-01`). */
  monthStart: string;
  initialSnapshot: GeduInvoicingSnapshot;
  /**
   * A clock to read the month against, instead of the live one. Only the
   * preview scene passes it: a fixture month is pinned to one instant, and the
   * live clock ticking past it would reclassify its lines under the reviewer.
   */
  now?: Date;
  /** Where a step of the month stepper goes; the scene points it at itself. */
  monthHref?: (month: string) => MonthHref;
}) {
  const t = useTranslations("geduInvoicing");
  const locale = resolveLocale(useLocale());
  const liveNow = useNow();
  const now = pinnedNow ?? liveNow;
  const { data: snapshot } = useAdminGeduInvoicingMonth(
    monthStart,
    initialSnapshot,
  );

  const invoice = useMemo(
    () => buildGeduInvoicing({ snapshot, locale, now }),
    [snapshot, locale, now],
  );

  // Collapsed is the default, so the set holds what is open.
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  // Which gedus are open belongs to the month they were opened in: a gedu keeps
  // their id across a step, and without this reset April would open with May's
  // gedus expanded. Reset during render, so no frame shows the wrong month's.
  const [shownMonth, setShownMonth] = useState(monthStart);
  if (shownMonth !== monthStart) {
    setShownMonth(monthStart);
    setOpenIds(new Set<string>());
  }

  const [query, setQuery] = useState("");
  const shownGedus = useMemo(
    () => filterGeduInvoices(invoice.gedus, query),
    [invoice.gedus, query],
  );

  const allOpen =
    shownGedus.length > 0 && shownGedus.every((gedu) => openIds.has(gedu.id));

  return (
    // The gutter is reserved because opening a gedu is itself what makes the
    // document scrollbar appear, and the reader's own click would otherwise
    // narrow the page under the figures they were reading.
    <div className="space-y-3 pb-12" data-reserve-scroll-gutter>
      <AdminGeduInvoicingHeading />

      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        <MonthStepper
          monthStart={invoice.monthStart}
          locale={locale}
          monthHref={monthHref}
          previousLabel={t("previousMonth")}
          nextLabel={t("nextMonth")}
        />
        {invoice.gedus.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchAriaLabel")}
                className="h-9 pl-10"
              />
            </div>
            {/* Kept in place while the search matches nobody, so the row does
                not reflow under the reader's typing. */}
            <Button
              variant="outline"
              size="sm"
              disabled={shownGedus.length === 0}
              onClick={() =>
                setOpenIds((ids) => {
                  const next = new Set(ids);
                  for (const gedu of shownGedus) {
                    if (allOpen) next.delete(gedu.id);
                    else next.add(gedu.id);
                  }
                  return next;
                })
              }
            >
              {allOpen ? t("collapseAll") : t("expandAll")}
            </Button>
          </div>
        )}
      </div>

      {invoice.gedus.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("adminEmptyMonth")}</p>
      ) : (
        <Card className="overflow-hidden">
          <MonthSummaryLine invoice={invoice} locale={locale} />
          {shownGedus.length === 0 && (
            <p
              className={cn(
                "border-t border-border py-2.5 text-sm text-muted-foreground",
                LEDGER_ROW_INSET,
              )}
            >
              {t("searchNoMatches", { query: query.trim() })}
            </p>
          )}
          <div className="divide-y divide-border border-t border-border">
            {shownGedus.map((gedu) => (
              <GeduSection
                key={gedu.id}
                gedu={gedu}
                locale={locale}
                isOpen={openIds.has(gedu.id)}
                onToggle={() =>
                  setOpenIds((ids) => {
                    const next = new Set(ids);
                    if (!next.delete(gedu.id)) next.add(gedu.id);
                    return next;
                  })
                }
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/** The live page's own answer: another month of this route. */
function adminMonthHref(month: string): MonthHref {
  return { pathname: ROUTES.admin.geduInvoicing, query: { month } };
}

/**
 * The page's title and description — a component because the route renders
 * them above a failed read too, and two copies of a heading drift.
 */
export function AdminGeduInvoicingHeading() {
  const t = useTranslations("geduInvoicing");

  return (
    <div>
      <h1 className="text-xl font-semibold">{t("adminTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("adminDescription")}</p>
    </div>
  );
}

/**
 * The two subtotals a gedu's invoice itemises, as parts of a count line. They
 * are the same two words on the month's line and on every gedu's.
 */
function useSplitParts() {
  const t = useTranslations("geduInvoicing");
  return (
    view: Pick<GeduInvoicingView, "municipalityTotalCents" | "consumerTotalCents">,
    locale: string,
  ) => [
    t("municipalityAmount", {
      amount: formatCurrencyFromCents(view.municipalityTotalCents, "eur", locale),
    }),
    t("consumerAmount", {
      amount: formatCurrencyFromCents(view.consumerTotalCents, "eur", locale),
    }),
  ];
}

/**
 * The warnings a total can carry, wherever a total is printed: missed sessions,
 * and what an unset fee left out. The second names clubs as well as sessions,
 * because a club with no fee and no recorded session costs no figure yet but is
 * still a gap an admin can close before it does.
 */
function TotalWarnings({
  unrecordedCount,
  clubsWithoutFee,
  sessionsWithoutFee,
}: {
  unrecordedCount: number;
  clubsWithoutFee: number;
  sessionsWithoutFee: number;
}) {
  const t = useTranslations("geduInvoicing");

  return (
    <>
      {unrecordedCount > 0 && (
        <CountLineWarning>
          {t("unrecordedCount", { count: unrecordedCount })}
        </CountLineWarning>
      )}
      {clubsWithoutFee > 0 && (
        <CountLineWarning>
          {t("excludedWithoutFee", {
            sessions: sessionsWithoutFee,
            clubs: clubsWithoutFee,
          })}
        </CountLineWarning>
      )}
    </>
  );
}

/** The whole month on one line: what it is made of, and what it comes to. */
function MonthSummaryLine({
  invoice,
  locale,
}: {
  invoice: GeduInvoicingView;
  locale: string;
}) {
  const t = useTranslations("geduInvoicing");
  const splitParts = useSplitParts();

  return (
    <LedgerSummaryLine
      facts={
        <>
          <CountLine
            parts={[
              t("geduCount", { count: invoice.geduCount }),
              t("sessionCount", { count: invoice.paidCount }),
              ...splitParts(invoice, locale),
            ]}
          />
          <TotalWarnings
            unrecordedCount={invoice.unrecordedCount}
            clubsWithoutFee={invoice.clubsWithoutFee}
            sessionsWithoutFee={invoice.sessionsWithoutFee}
          />
        </>
      }
      caption={t("monthTotal")}
      figure={formatCurrencyFromCents(invoice.totalCents, "eur", locale)}
    />
  );
}

/**
 * One gedu: a line that states their whole month — how many clubs, how many
 * sessions, the two subtotals, what was missed or left out — with the total on
 * the money axis, and their clubs behind it. Closed is the default and the line
 * is the answer; opening it is how the reader asks why.
 *
 * The name links to the gedu's admin page, and stops its own click so following
 * it does not also open the line.
 */
function GeduSection({
  gedu,
  locale,
  isOpen,
  onToggle,
}: {
  gedu: GeduInvoice;
  locale: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("geduInvoicing");
  const splitParts = useSplitParts();
  const name = fullName(gedu);

  return (
    <LedgerSection
      isOpen={isOpen}
      onToggle={onToggle}
      toggleLabel={t("clubsOf", { name })}
      line={
        <>
          <Link
            href={ROUTES.admin.user(gedu.id)}
            onClick={(event) => event.stopPropagation()}
            className="shrink-0 text-sm font-semibold hover:underline"
          >
            {name}
          </Link>
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            <CountLine
              parts={[
                t("clubCount", { count: gedu.clubs.length }),
                t("sessionCount", { count: gedu.paidCount }),
                ...splitParts(gedu, locale),
              ]}
            />
            <TotalWarnings
              unrecordedCount={gedu.unrecordedCount}
              clubsWithoutFee={gedu.clubsWithoutFee}
              sessionsWithoutFee={gedu.sessionsWithoutFee}
            />
          </span>
          <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">
            {formatCurrencyFromCents(gedu.totalCents, "eur", locale)}
          </span>
        </>
      }
    >
      <GeduClubTable
        gedu={gedu}
        locale={locale}
        audience="admin"
        clubsStartOpen={false}
      />
    </LedgerSection>
  );
}
