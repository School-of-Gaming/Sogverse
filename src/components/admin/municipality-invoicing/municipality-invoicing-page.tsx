"use client";

import { useId, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  TriangleAlert,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { monthsAfter } from "@/lib/calendar-date";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import { useNow } from "@/providers";
import { cn, formatCurrencyFromCents, formatDateOnly } from "@/lib/utils";
import type { MunicipalityInvoicingSnapshot } from "@/services/municipality-invoicing";
import { useMunicipalityInvoicingMonth } from "@/services/municipality-invoicing";
import {
  buildMunicipalityInvoicing,
  type InvoiceClub,
  type InvoiceMunicipality,
  type InvoiceSession,
  type MunicipalityInvoicingView,
} from "./build-municipality-invoicing";

/**
 * **Municipality invoicing** — one month, one municipality at a time.
 *
 * The page the CFO opens once a month to raise the invoices. It is read-only
 * from end to end: every number on it is derived at read time from the clubs'
 * current fees and the sessions that were actually recorded, and nothing here
 * writes, snapshots or exports anything.
 *
 * The shell owns four things and nothing else: the month the URL names, the
 * clock, the reader's locale, and which sections are open. Everything else —
 * which clubs are in the month, which dates they ran, what the totals are — is
 * one pure build over the document the route already fetched, which is why
 * there is no loading state anywhere below this line.
 *
 * **The month lives in the URL, not in state.** A month of invoicing is
 * something a CFO sends to somebody or comes back to tomorrow, and a stepper
 * held in component state gives them no way to do either. It also means the
 * server can fetch the right month before the first paint, which is what makes
 * the page arrive finished rather than arriving and then filling in.
 *
 * **Which sections are open is the opposite kind of state and stays local.** It
 * is where a reader is in the page rather than what the page is about: nobody
 * links somebody else to "Espoo expanded", and persisting it would mean the
 * page opened differently for the same month depending on what was done to it
 * last time.
 */
export function MunicipalityInvoicingPage({
  monthStart,
  initialSnapshot,
}: {
  /** The month on screen, as its first day (`YYYY-MM-01`). */
  monthStart: string;
  initialSnapshot: MunicipalityInvoicingSnapshot;
}) {
  const t = useTranslations("admin.municipalityInvoicing");
  const locale = resolveLocale(useLocale());
  const now = useNow();
  const { data: snapshot } = useMunicipalityInvoicingMonth(
    monthStart,
    initialSnapshot,
  );

  const invoice = useMemo(
    () =>
      buildMunicipalityInvoicing({
        snapshot,
        locale,
        now,
        noMunicipalityLabel: t("noMunicipality"),
      }),
    [snapshot, locale, now, t],
  );

  // Collapsed is the default, so the set holds what is *open* — an empty set is
  // the opening state and needs no list of every municipality to express it.
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const allOpen =
    invoice.municipalities.length > 0 &&
    invoice.municipalities.every((one) => openKeys.has(sectionKey(one)));

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthStepper monthStart={invoice.monthStart} locale={locale} />
        {/* One control rather than two: the pair is a single state with two
            ends, and a reader who can see that everything is open does not also
            need an "expand all" sitting next to it doing nothing. */}
        {invoice.municipalities.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setOpenKeys(
                allOpen
                  ? new Set<string>()
                  : new Set(invoice.municipalities.map(sectionKey)),
              )
            }
          >
            {allOpen ? t("collapseAll") : t("expandAll")}
          </Button>
        )}
      </div>

      {invoice.municipalities.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("emptyMonth")}</p>
      ) : (
        <>
          <MonthSummary invoice={invoice} locale={locale} />
          <div className="space-y-4">
            {invoice.municipalities.map((municipality) => (
              <MunicipalitySection
                key={sectionKey(municipality)}
                municipality={municipality}
                locale={locale}
                isOpen={openKeys.has(sectionKey(municipality))}
                onToggle={() =>
                  setOpenKeys((keys) => {
                    const next = new Set(keys);
                    const key = sectionKey(municipality);
                    if (!next.delete(key)) next.add(key);
                    return next;
                  })
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A municipality's identity as a section: its own id, or the one name the
 * trailing no-municipality bucket can be told apart by.
 *
 * A function rather than an inline `?? "none"` at four call sites, because the
 * open-set's keys and the React keys have to be the same string or a section
 * opens one card and marks another.
 */
function sectionKey(municipality: InvoiceMunicipality): string {
  return municipality.id ?? "none";
}

/**
 * The whole month in one line: what it comes to, and what it is made of.
 *
 * It leads the page because it is the figure the invoice run is *for* — a CFO
 * opening this page wants to know what the month is worth before wanting to
 * know which municipality owes which part of it — and because every section
 * below it now opens closed, so without it the page's first screen would carry
 * no number at all.
 *
 * The total sits on the same right edge as every municipality total under it,
 * which is the whole reason it is a `Card` like they are rather than a band of
 * its own: the column of figures runs from here to the bottom of the page.
 */
function MonthSummary({
  invoice,
  locale,
}: {
  invoice: MunicipalityInvoicingView;
  locale: string;
}) {
  const t = useTranslations("admin.municipalityInvoicing");

  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {t("monthTotal")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <CountLine
              parts={[
                t("municipalityCount", { count: invoice.municipalityCount }),
                t("clubCount", { count: invoice.clubCount }),
                t("recordedSessions", { count: invoice.recordedCount }),
              ]}
            />
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">
            {formatCurrencyFromCents(invoice.totalCents, "eur", locale)}
          </p>
          {invoice.clubsWithoutFee > 0 && <ExcludedClubs count={invoice.clubsWithoutFee} />}
        </div>
      </CardHeader>
    </Card>
  );
}

/**
 * Facts about a total, strung along one line.
 *
 * The separator is punctuation rather than copy — it is the same middle dot the
 * schedule formatter already joins a line's parts with — so it is written here
 * and not in five message files, where it would be five chances to type a
 * hyphen instead.
 */
function CountLine({ parts }: { parts: readonly string[] }) {
  return <>{parts.join(SCHEDULE_PART_SEPARATOR)}</>;
}

/** The one line that says a total is short, wherever a total is printed. */
function ExcludedClubs({ count }: { count: number }) {
  const t = useTranslations("admin.municipalityInvoicing");

  return (
    <p className="flex items-center justify-end gap-1.5 text-xs font-medium text-warning">
      <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {t("excludedClubs", { count })}
    </p>
  );
}

/**
 * Previous month, the month's own name, next month — the same three-control
 * shape the dashboard's week stepper uses, with the label between the arrows
 * that move it, and navigating by link rather than by state because the month is
 * a URL.
 *
 * The month is named by `Intl` rather than by a message key: "syyskuu 2026" and
 * "September 2026" are a date format, not a sentence, and a catalogue of twelve
 * month names per locale is a table `Intl` already ships.
 */
function MonthStepper({
  monthStart,
  locale,
}: {
  monthStart: string;
  locale: string;
}) {
  const t = useTranslations("admin.municipalityInvoicing");
  const previous = monthsAfter(monthStart, -1).slice(0, 7);
  const next = monthsAfter(monthStart, 1).slice(0, 7);

  return (
    <div className="flex items-center gap-2">
      <MonthLink month={previous} label={t("previousMonth")}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </MonthLink>
      {/* Between its two controls, where the thing being stepped belongs: a
          label to one side of both arrows reads as a caption on the pair rather
          than as the value they move. */}
      <span className="text-sm font-medium tabular-nums">
        {formatDateOnly(monthStart, locale, {
          month: "long",
          year: "numeric",
        })}
      </span>
      <MonthLink month={next} label={t("nextMonth")}>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </MonthLink>
    </div>
  );
}

function MonthLink({
  month,
  label,
  children,
}: {
  month: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={{
        pathname: ROUTES.admin.municipalityInvoicing,
        query: { month },
      }}
      aria-label={label}
      className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
    >
      {children}
    </Link>
  );
}

/**
 * One municipality's invoice: a summary row that is always there, and the
 * clubs behind it when the reader asks for them.
 *
 * **Closed is the default, and the summary row is the page.** A month can carry
 * a hundred clubs across twenty municipalities, and a page that opens with all
 * of them expanded is one where the figure being invoiced — the municipality
 * total — can only be found by scrolling past the working that produced it. So
 * the row states the whole answer (who, how many clubs, how many sessions, what
 * it comes to) and opening it is how the reader asks *why*.
 *
 * The row itself is identical open and closed, which is what keeps the layout
 * rule satisfied: expanding adds the clubs underneath and moves nothing the
 * reader was already looking at, and it is their own click that did it.
 *
 * Where a club had to be left out of the total, the reason is stated directly
 * under the total rather than only on the club — a total that is quietly short
 * is the one failure mode this page cannot afford, and under a *closed* section
 * it would otherwise be invisible.
 */
function MunicipalitySection({
  municipality,
  locale,
  isOpen,
  onToggle,
}: {
  municipality: InvoiceMunicipality;
  locale: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("admin.municipalityInvoicing");
  const regionId = useId();

  return (
    <Card>
      {/* The header is the control, so the padding lives on the button and not
          on the header around it: a hit area that stops short of the card's own
          edge is a row that ignores half the clicks aimed at it. */}
      <CardHeader className="p-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={regionId}
          className={cn(
            "flex w-full items-start gap-3 rounded-t-lg p-6 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-act",
            // Closed, the control *is* the card and rounds with it; open, its
            // bottom edge is a join with the clubs below and must be square, or
            // the hover fill cuts a curve out of the middle of the card.
            !isOpen && "rounded-b-lg",
          )}
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180",
            )}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <h2
                className={cn(
                  "text-xl font-semibold",
                  municipality.id === null && "text-warning",
                )}
              >
                {municipality.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                <CountLine
                  parts={[
                    t("clubCount", { count: municipality.clubs.length }),
                    t("recordedSessions", { count: municipality.recordedCount }),
                  ]}
                />
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-semibold tabular-nums">
                {formatCurrencyFromCents(municipality.totalCents, "eur", locale)}
              </p>
              {municipality.clubsWithoutFee > 0 && (
                <ExcludedClubs count={municipality.clubsWithoutFee} />
              )}
            </div>
          </div>
        </button>
      </CardHeader>
      {/* The clubs are divided rows on the card's own ground rather than boxes
          inside it, and that is what puts every number on one axis: a box would
          inset its contents by its own border and padding, so a club's total
          would stop short of the municipality total above it by exactly that
          much. Divided, all four — session amount, club line, municipality
          total and the month total above them all — end at the card's right
          padding. */}
      {isOpen && (
        <CardContent id={regionId} className="divide-y divide-border">
          {municipality.clubs.map((club) => (
            <ClubBlock key={club.id} club={club} locale={locale} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

/**
 * One club: what it is, what it ran, and every session behind the number.
 *
 * The club name links to its admin page, which is the whole repair path for the
 * one thing this page can find wrong — a fee nobody has filled in — so the link
 * is there whether or not the fee is missing rather than appearing only when
 * something is broken.
 *
 * The link is a real link inside a section whose header is a button, which is
 * why the header's hit area stops at the header: a control nested inside
 * another control is the one arrangement that makes a click ambiguous.
 */
function ClubBlock({ club, locale }: { club: InvoiceClub; locale: string }) {
  const t = useTranslations("admin.municipalityInvoicing");
  // Where it meets and when, on one line. Assembled here rather than in the
  // JSX because the only literal in it is the separator the schedule formatter
  // already owns; every word in it comes from the data or from `Intl`.
  const whereAndWhen = [club.locationName, club.scheduleSummary]
    .filter((part): part is string => part !== null)
    .join(SCHEDULE_PART_SEPARATOR);

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <Link
            href={ROUTES.admin.product("municipality_club", club.id)}
            className="font-medium hover:underline"
          >
            {club.name}
          </Link>
          {/* Only where there is something to say. A club with neither a
              location nor a slot would otherwise get an empty line holding open
              a gap under its name for copy that is never coming. */}
          {whereAndWhen !== "" && (
            <p className="text-xs text-muted-foreground">{whereAndWhen}</p>
          )}
        </div>
        {/* The two nulls travel together — the total is null exactly when the
            fee is — and both are named here so nothing has to stand in for a
            missing number with a zero the reader would believe. */}
        {club.feeCents === null || club.totalCents === null ? (
          <p className="flex items-center justify-end gap-1.5 text-right text-sm font-medium text-warning">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
            {t("feeNotSet")}
          </p>
        ) : (
          <p className="text-right text-sm tabular-nums">
            {t("clubTotal", {
              count: club.recordedCount,
              fee: formatCurrencyFromCents(club.feeCents, "eur", locale),
              total: formatCurrencyFromCents(club.totalCents, "eur", locale),
            })}
          </p>
        )}
      </div>

      <SessionTable club={club} locale={locale} />
    </div>
  );
}

/**
 * The club's month as a real table: when, which week, what happened, what it is
 * worth.
 *
 * It is a `<table>` and not a grid of `<li>`s because it *is* a table — four
 * facts about each of a run of dates, read down the columns as often as across
 * the rows — and a screen reader announcing "column: amount" is a fact the
 * previous three-column grid could only imply. `table-fixed` with percentage
 * widths is what makes the columns agree between one club and the next: an auto
 * layout measures each club's own content, so a page of clubs would have a page
 * of different money axes.
 *
 * **The widths spread the three text columns across the card rather than
 * packing them against the left edge.** At a desk — which is where an admin
 * surface is designed to be read — a row of four short values bunched into the
 * first third of a 1900px card leaves two thirds of every club empty and the
 * money a long way from the words explaining it.
 *
 * The amount column is right-aligned, `tabular-nums`, and ends at the card's own
 * right padding, which is the axis every other figure on the page shares.
 */
function SessionTable({ club, locale }: { club: InvoiceClub; locale: string }) {
  const t = useTranslations("admin.municipalityInvoicing");

  return (
    <table className="mt-3 w-full table-fixed text-sm">
      <thead>
        {/* Furniture, not voice: a column header is a marker a reader scans for
            structure, which is the one place the house style keeps its caps. */}
        <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
          <th scope="col" className="w-[32%] pb-1 text-left font-medium">
            {t("columnDate")}
          </th>
          <th scope="col" className="w-[14%] pb-1 text-left font-medium">
            {t("columnWeek")}
          </th>
          <th scope="col" className="w-[28%] pb-1 text-left font-medium">
            {t("columnStatus")}
          </th>
          <th scope="col" className="w-[26%] pb-1 text-right font-medium">
            {t("columnAmount")}
          </th>
        </tr>
      </thead>
      <tbody>
        {club.sessions.map((session) => (
          <SessionRow
            key={session.date}
            session={session}
            feeCents={club.feeCents}
            locale={locale}
          />
        ))}
      </tbody>
    </table>
  );
}

/**
 * One dated line: when it was, which week that is, what happened, and what it is
 * worth.
 *
 * The three kinds read differently on purpose. A recorded session carries the
 * fee and nothing else in the way of explanation — it is the ordinary case and
 * should be quiet. An unrecorded one is drawn in warning tone and says so in
 * words, because a zero with no explanation beside it is indistinguishable from
 * a free session. An upcoming one carries no amount at all: it has not
 * happened, and printing €0 against a date in the future would invite somebody
 * to go looking for a session nobody has missed.
 *
 * **The weekday is the one thing that goes under `sm`.** A finance officer
 * reading a column of dates reads the weekday to check it against the club's
 * schedule line above, which is worth a word at a desk and is the first word
 * worth losing on a phone — where the status column, which is the difference
 * between a session that happened and one that did not, is not.
 */
function SessionRow({
  session,
  feeCents,
  locale,
}: {
  session: InvoiceSession;
  feeCents: number | null;
  locale: string;
}) {
  const t = useTranslations("admin.municipalityInvoicing");
  const c = useTranslations("common");

  return (
    <tr
      className={cn(
        "align-baseline",
        session.kind === "upcoming" && "text-muted-foreground",
        session.kind === "unrecorded" && "text-warning",
      )}
    >
      <td className="py-1">
        <span className="flex items-baseline gap-1.5">
          <span className="hidden sm:inline">
            {formatDateOnly(session.date, locale, { weekday: "short" })}
          </span>
          <span className="tabular-nums">
            {formatDateOnly(session.date, locale, {
              day: "numeric",
              month: "numeric",
              year: "numeric",
            })}
          </span>
        </span>
      </td>
      <td className="py-1 text-xs tabular-nums text-muted-foreground">
        {c("week", { week: session.isoWeek })}
      </td>
      <td className="py-1 text-xs">
        <span className="flex items-center gap-1.5">
          {session.kind === "unrecorded" && (
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          {session.kind === "recorded" && t("recorded")}
          {session.kind === "unrecorded" && t("notRecorded")}
          {session.kind === "upcoming" && t("upcoming")}
        </span>
      </td>
      {/* The money column. Whatever it holds ends on the column's right edge —
          the axis every figure on this page shares — and an amount that has a
          word beside it flows leftward into the column's slack rather than
          pushing the figure off that axis. */}
      <td className="py-1 text-right tabular-nums">
        <span className="flex items-baseline justify-end gap-1.5">
          {session.kind === "recorded" &&
            (feeCents === null ? (
              <>
                <TriangleAlert
                  className="h-3.5 w-3.5 shrink-0 self-center text-warning"
                  aria-hidden
                />
                <span className="text-xs text-warning">{t("feeNotSet")}</span>
              </>
            ) : (
              formatCurrencyFromCents(feeCents, "eur", locale)
            ))}
          {session.kind === "unrecorded" &&
            formatCurrencyFromCents(0, "eur", locale)}
        </span>
      </td>
    </tr>
  );
}
