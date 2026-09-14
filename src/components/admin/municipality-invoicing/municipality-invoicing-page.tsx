"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
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
} from "./build-municipality-invoicing";

/**
 * **Municipality invoicing** — one month, one municipality at a time.
 *
 * The page the CFO opens once a month to raise the invoices. It is read-only
 * from end to end: every number on it is derived at read time from the clubs'
 * current fees and the sessions that were actually recorded, and nothing here
 * writes, snapshots or exports anything.
 *
 * The shell owns three things and nothing else: the month the URL names, the
 * clock, and the reader's locale. Everything else — which clubs are in the
 * month, which dates they ran, what the totals are — is one pure build over the
 * document the route already fetched, which is why there is no loading state
 * anywhere below this line.
 *
 * **The month lives in the URL, not in state.** A month of invoicing is
 * something a CFO sends to somebody or comes back to tomorrow, and a stepper
 * held in component state gives them no way to do either. It also means the
 * server can fetch the right month before the first paint, which is what makes
 * the page arrive finished rather than arriving and then filling in.
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

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      <MonthStepper monthStart={invoice.monthStart} locale={locale} />

      {invoice.municipalities.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("emptyMonth")}</p>
      ) : (
        <div className="space-y-6">
          {invoice.municipalities.map((municipality) => (
            <MunicipalityCard
              key={municipality.id ?? "none"}
              municipality={municipality}
              locale={locale}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Previous month, the month's own name, next month — the same three-control
 * shape the dashboard's week stepper uses, navigating by link rather than by
 * state because the month is a URL.
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
    <div className="flex items-center gap-1">
      <MonthLink month={previous} label={t("previousMonth")}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </MonthLink>
      <MonthLink month={next} label={t("nextMonth")}>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </MonthLink>
      <span className="ml-2 text-sm font-medium">
        {formatDateOnly(monthStart, locale, {
          month: "long",
          year: "numeric",
        })}
      </span>
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
 * One municipality's invoice: the total in the header, the clubs beneath it.
 *
 * The total leads because it is the number being invoiced and everything under
 * it is the working. Where a club had to be left out of it, the reason is
 * stated directly under the total rather than only on the club — a total that
 * is quietly short is the one failure mode this page cannot afford.
 */
function MunicipalityCard({
  municipality,
  locale,
}: {
  municipality: InvoiceMunicipality;
  locale: string;
}) {
  const t = useTranslations("admin.municipalityInvoicing");

  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2
          className={cn(
            "text-xl font-semibold",
            municipality.id === null && "text-warning",
          )}
        >
          {municipality.name}
        </h2>
        <div className="text-right">
          <p className="text-xl font-semibold tabular-nums">
            {formatCurrencyFromCents(municipality.totalCents, "eur", locale)}
          </p>
          {municipality.clubsWithoutFee > 0 && (
            <p className="flex items-center justify-end gap-1.5 text-xs font-medium text-warning">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t("excludedClubs", { count: municipality.clubsWithoutFee })}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {municipality.clubs.map((club) => (
          <ClubBlock key={club.id} club={club} locale={locale} />
        ))}
      </CardContent>
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
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="min-w-0">
          <Link
            href={ROUTES.admin.product("municipality_club", club.id)}
            className="font-medium hover:underline"
          >
            {club.name}
          </Link>
          <p className="text-xs text-muted-foreground">{whereAndWhen}</p>
        </div>
        {/* The two nulls travel together — the total is null exactly when the
            fee is — and both are named here so nothing has to stand in for a
            missing number with a zero the reader would believe. */}
        {club.feeCents === null || club.totalCents === null ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
            {t("feeNotSet")}
          </p>
        ) : (
          <p className="text-sm tabular-nums">
            {t("clubTotal", {
              count: club.recordedCount,
              fee: formatCurrencyFromCents(club.feeCents, "eur", locale),
              total: formatCurrencyFromCents(club.totalCents, "eur", locale),
            })}
          </p>
        )}
      </div>

      <ul className="mt-3 space-y-1">
        {club.sessions.map((session) => (
          <SessionRow
            key={session.date}
            session={session}
            feeCents={club.feeCents}
            locale={locale}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * One dated line: when it was, which week that is, and what it is worth.
 *
 * The three kinds read differently on purpose. A recorded session carries the
 * fee and nothing else — it is the ordinary case and should be quiet. An
 * unrecorded one carries a zero *and* says why, because a zero with no
 * explanation beside it is indistinguishable from a free session. An upcoming
 * one carries no amount at all: it has not happened, and printing €0 against a
 * date in the future would invite somebody to go looking for a session nobody
 * has missed.
 *
 * The row stacks below `sm`: three columns of a few characters each read fine
 * side by side on a monitor, which is where an admin is, and stack rather than
 * truncate on a phone.
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
  const muted = session.kind === "upcoming";

  return (
    <li
      className={cn(
        "flex flex-col gap-0.5 text-sm sm:flex-row sm:items-baseline sm:gap-3",
        muted && "text-muted-foreground",
        session.kind === "unrecorded" && "text-warning",
      )}
    >
      <span className="w-32 shrink-0 tabular-nums">
        {formatDateOnly(session.date, locale, {
          day: "numeric",
          month: "numeric",
          year: "numeric",
        })}
      </span>
      <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
        {c("week", { week: session.isoWeek })}
      </span>
      <span className="flex items-center gap-1.5 tabular-nums">
        {session.kind === "recorded" &&
          (feeCents === null ? (
            <>
              <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              <span className="text-warning">{t("feeNotSet")}</span>
            </>
          ) : (
            formatCurrencyFromCents(feeCents, "eur", locale)
          ))}
        {session.kind === "unrecorded" && (
          <>
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {formatCurrencyFromCents(0, "eur", locale)}
            <span className="text-xs">{t("notRecorded")}</span>
          </>
        )}
        {session.kind === "upcoming" && (
          <span className="text-xs">{t("upcoming")}</span>
        )}
      </span>
    </li>
  );
}
