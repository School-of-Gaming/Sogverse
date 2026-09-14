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
      {/* The clubs are divided rows on the card's own ground rather than boxes
          inside it, and that is what puts every number on one axis: a box would
          inset its contents by its own border and padding, so a club's total
          would stop short of the municipality total above it by exactly that
          much. Divided, all three — session amount, club line, municipality
          total — end at the card's right padding. */}
      <CardContent className="divide-y divide-border">
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
 * The page's one money axis, as a grid: the date, the ISO week, and the amount.
 *
 * It is a constant rather than a class string inside the row because the axis is
 * the whole point — a second row spelling its own widths is how a column of
 * figures stops being a column — and because the two fixed widths are the only
 * numbers on this page that have to agree with each other. They are sized for
 * the widest thing each column holds: a full numeric date, and `vk 38`.
 */
const MONEY_GRID =
  "grid grid-cols-[5.5rem_3.25rem_1fr] gap-x-2 sm:grid-cols-[8rem_5rem_1fr] sm:gap-x-3";

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
 * The row is three grid columns — date, week, money — at every width, the first
 * two at fixed widths so the money column starts at the same place on every row
 * of every club, and the money itself right-aligned inside it. A number is read
 * by comparing it with the numbers above and below it, and a column of amounts
 * that each begin where the words before them happened to end cannot be read
 * that way at all. The two fixed columns narrow on a phone rather than stacking:
 * three short columns still fit 360px, and stacking would put each amount on its
 * own line, which is the one arrangement that destroys the axis entirely.
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
        MONEY_GRID,
        "items-baseline text-sm",
        muted && "text-muted-foreground",
        session.kind === "unrecorded" && "text-warning",
      )}
    >
      <span className="tabular-nums">
        {formatDateOnly(session.date, locale, {
          day: "numeric",
          month: "numeric",
          year: "numeric",
        })}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {c("week", { week: session.isoWeek })}
      </span>
      {/* The money column. Whatever it holds ends on the column's right edge:
          the amount is its last child, and the words explaining an amount flow
          leftward into the column's slack instead of pushing the figure off the
          axis every other row on the page shares. */}
      <span className="flex items-baseline justify-end gap-1.5 text-right tabular-nums">
        {session.kind === "recorded" &&
          (feeCents === null ? (
            <>
              <TriangleAlert
                className="h-3.5 w-3.5 shrink-0 self-center text-warning"
                aria-hidden
              />
              <span className="text-warning">{t("feeNotSet")}</span>
            </>
          ) : (
            formatCurrencyFromCents(feeCents, "eur", locale)
          ))}
        {session.kind === "unrecorded" && (
          <>
            <TriangleAlert
              className="h-3.5 w-3.5 shrink-0 self-center"
              aria-hidden
            />
            <span className="text-xs">{t("notRecorded")}</span>
            {formatCurrencyFromCents(0, "eur", locale)}
          </>
        )}
        {session.kind === "upcoming" && (
          <span className="text-xs">{t("upcoming")}</span>
        )}
      </span>
    </li>
  );
}
