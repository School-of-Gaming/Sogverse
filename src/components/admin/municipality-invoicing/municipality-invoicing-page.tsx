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
import { Card } from "@/components/ui/card";
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
 *
 * **The whole month is one ledger, so it is one card.** A month runs to a
 * hundred clubs; every municipality in a card of its own spent a border, a gap
 * and two lots of padding per municipality on saying something the reader
 * already knew from the name, and pushed the figures at the bottom of the page
 * off the screen. One card, hairline-divided, is also what makes the money axis
 * exact rather than approximate: the month total, every municipality total and
 * every club total end on one right padding, because there is one right padding.
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
    <div className="space-y-3 pb-12">
      {/* The page's own title, at the smallest size that still reads as the
          page's title. This is a working surface rather than a page somebody
          arrives at, and a display heading over a dense ledger spends a tenth of
          the first screen naming what the sidebar already named. */}
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
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
        <Card className="overflow-hidden">
          <MonthSummaryRow invoice={invoice} locale={locale} />
          <div className="divide-y divide-border border-t border-border">
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
        </Card>
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

/** The one horizontal inset every row on the ledger shares. */
const ROW_INSET = "px-3";

/**
 * The whole month on one line: what it is made of on the left, what it comes to
 * on the right.
 *
 * It leads the ledger because it is the figure the invoice run is *for*, and it
 * is the ledger's own first row rather than a card above it for the reason every
 * other line on this page is where it is: the total has to end on the same right
 * padding as the twenty totals underneath it, and a separate card's padding is a
 * different padding.
 *
 * The exclusion warning sits with the counts on the left rather than under the
 * figure, so the figure keeps the line to itself and the row stays one line
 * high.
 */
function MonthSummaryRow({
  invoice,
  locale,
}: {
  invoice: MunicipalityInvoicingView;
  locale: string;
}) {
  const t = useTranslations("admin.municipalityInvoicing");

  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2",
        ROW_INSET,
      )}
    >
      <p className="text-xs text-muted-foreground">
        <CountLine
          parts={[
            t("municipalityCount", { count: invoice.municipalityCount }),
            t("clubCount", { count: invoice.clubCount }),
            t("recordedSessions", { count: invoice.recordedCount }),
          ]}
        />
        {invoice.clubsWithoutFee > 0 && (
          <>
            {SCHEDULE_PART_SEPARATOR}
            <ExcludedClubs count={invoice.clubsWithoutFee} />
          </>
        )}
      </p>
      <p className="ml-auto flex items-baseline gap-2">
        {/* Furniture: the one caption on the ledger, because a figure at the end
            of a line of counts would otherwise be a number with no noun. */}
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {t("monthTotal")}
        </span>
        <span className="text-base font-semibold tabular-nums">
          {formatCurrencyFromCents(invoice.totalCents, "eur", locale)}
        </span>
      </p>
    </div>
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

/**
 * The one phrase that says a total is short, wherever a total is printed.
 *
 * An inline span rather than a line of its own: it travels along the same muted
 * count line the reader is already scanning, which is what keeps a municipality
 * that excludes a club exactly as tall as one that does not.
 */
function ExcludedClubs({ count }: { count: number }) {
  const t = useTranslations("admin.municipalityInvoicing");

  return (
    <span className="font-medium text-warning">
      {t("excludedClubs", { count })}
    </span>
  );
}

/** A fee, or a total, that cannot be stated because nobody has set the fee. */
function FeeNotSet() {
  const t = useTranslations("admin.municipalityInvoicing");

  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-warning">
      <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
      {t("feeNotSet")}
    </span>
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
      className="rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
    >
      {children}
    </Link>
  );
}

/**
 * One municipality: a one-line summary that is always there, and the clubs
 * behind it when the reader asks for them.
 *
 * **Closed is the default, and the summary line is the page.** A month can carry
 * a hundred clubs across twenty municipalities, and a page that opens with all
 * of them expanded is one where the figure being invoiced can only be found by
 * scrolling past the working that produced it. So the line states the whole
 * answer — who, how many clubs, how many sessions ran, what it comes to, and
 * whether a club had to be left out — and opening it is how the reader asks
 * *why*.
 *
 * The line is identical open and closed, which is what keeps the layout rule
 * satisfied: expanding adds the clubs underneath and moves nothing the reader
 * was already looking at, and it is their own click that did it.
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
    <section>
      {/* The whole line is the control, so the inset lives on the button rather
          than on a wrapper around it: a hit area that stops short of the row's
          own edge is a row that ignores half the clicks aimed at it. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={regionId}
        className={cn(
          "flex w-full items-baseline gap-2 py-1.5 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-act",
          ROW_INSET,
        )}
      >
        <ChevronDown
          aria-hidden
          className={cn(
            "h-4 w-4 shrink-0 self-center text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
        <span
          className={cn(
            "shrink-0 text-sm font-semibold",
            municipality.id === null && "text-warning",
          )}
        >
          {municipality.name}
        </span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          <CountLine
            parts={[
              t("clubCount", { count: municipality.clubs.length }),
              t("recordedSessions", { count: municipality.recordedCount }),
            ]}
          />
          {municipality.clubsWithoutFee > 0 && (
            <>
              {SCHEDULE_PART_SEPARATOR}
              <ExcludedClubs count={municipality.clubsWithoutFee} />
            </>
          )}
        </span>
        <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">
          {formatCurrencyFromCents(municipality.totalCents, "eur", locale)}
        </span>
      </button>
      {isOpen && (
        <div id={regionId} className={cn("overflow-x-auto pb-1", ROW_INSET)}>
          <ClubTable municipality={municipality} locale={locale} />
        </div>
      )}
    </section>
  );
}

/**
 * A municipality's clubs as one table: product, schedule, fee, sessions, total.
 *
 * **One table per municipality, not one per club, and `table-fixed`.** The
 * columns are what makes a page of a hundred clubs readable — a fee is read
 * against the fee above it and a total against the total above it — and an auto
 * layout measures each table's own content, so a table per club would be a page
 * of clubs each with its own money axis. Fixed proportional widths give the
 * whole municipality one set of columns, and the last of them ends on the row
 * inset every other figure on the page ends on.
 *
 * **It scrolls sideways rather than stacking.** This is an admin surface read at
 * a desk; below the width the columns need, a phone gets the table it would get
 * on a laptop and drags it, which is a better answer for a ledger than five
 * stacked labelled values per club. The scroll is this element's, so the page
 * body's own width is untouched.
 */
function ClubTable({
  municipality,
  locale,
}: {
  municipality: InvoiceMunicipality;
  locale: string;
}) {
  const t = useTranslations("admin.municipalityInvoicing");

  return (
    <table className="w-full min-w-[52rem] table-fixed text-sm">
      <thead>
        {/* Furniture, not voice: a column header is a marker a reader scans for
            structure, which is the one place the house style keeps its caps. */}
        <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {/* The disclosure column. It has no name because the control in it is
              named per club, by the club it belongs to. */}
          <th scope="col" className="w-7" />
          <th scope="col" className="py-1 pr-2 text-left font-medium">
            {t("columnClub")}
          </th>
          <th scope="col" className="w-[22%] py-1 pr-2 text-left font-medium">
            {t("columnSchedule")}
          </th>
          <th scope="col" className="w-[14%] py-1 pr-2 text-right font-medium">
            {t("columnFee")}
          </th>
          <th scope="col" className="w-[14%] py-1 pr-2 text-right font-medium">
            {t("columnSessions")}
          </th>
          <th scope="col" className="w-[16%] py-1 text-right font-medium">
            {t("columnTotal")}
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border border-t border-border">
        {municipality.clubs.map((club) => (
          <ClubRows key={club.id} club={club} locale={locale} />
        ))}
      </tbody>
    </table>
  );
}

/**
 * One club's line, and the dates behind its number when the reader opens it.
 *
 * Five facts on one line, in the order the arithmetic runs: what it is, when it
 * meets, what a session of it costs, how many ran, and what that comes to. The
 * total is the product of the two columns to its left, so a reader can check the
 * multiplication without leaving the row — which is the whole reason the fee is
 * on the line at all rather than only in the detail.
 *
 * **A club with sessions it should have run and did not says so on its own
 * line.** The count cell carries the missed count beside the recorded one, in
 * warning tone, so a month's problems are visible without opening anything —
 * which matters precisely because every club here is closed by default. Dates
 * still ahead of the club get no mention: nothing is wrong with a session that
 * has not happened yet, and a note about one would be indistinguishable at a
 * glance from a note about one that was missed.
 *
 * The club name links to its admin page, which is the whole repair path for the
 * one thing this page can find wrong — a fee nobody has filled in — so the link
 * is there whether or not the fee is missing. It sits *beside* the disclosure
 * control rather than inside it, because a control nested inside another control
 * is the one arrangement that makes a click ambiguous.
 */
function ClubRows({ club, locale }: { club: InvoiceClub; locale: string }) {
  const t = useTranslations("admin.municipalityInvoicing");
  const [isOpen, setIsOpen] = useState(false);
  const detailId = useId();

  return (
    <>
      <tr className="align-baseline">
        <td className="py-1">
          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
            aria-controls={detailId}
            aria-label={t("sessionsFor", { club: club.name })}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
          >
            <ChevronDown
              aria-hidden
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                isOpen && "rotate-180",
              )}
            />
          </button>
        </td>
        <td className="py-1 pr-2">
          {/* Truncated with the whole name on hover: a product name runs long
              and a column that grows to fit the longest one takes the width the
              figures need. */}
          <Link
            href={ROUTES.admin.product("municipality_club", club.id)}
            title={club.name}
            className="block truncate font-medium hover:underline"
          >
            {club.name}
          </Link>
        </td>
        <td
          className="truncate py-1 pr-2 text-xs text-muted-foreground"
          title={club.scheduleSummary ?? undefined}
        >
          {club.scheduleSummary}
        </td>
        <td className="py-1 pr-2 text-right tabular-nums">
          {club.feeCents === null ? (
            <FeeNotSet />
          ) : (
            formatCurrencyFromCents(club.feeCents, "eur", locale)
          )}
        </td>
        <td className="py-1 pr-2 text-right tabular-nums">
          {club.recordedCount}
          {club.unrecordedCount > 0 && (
            <span className="whitespace-nowrap text-xs font-medium text-warning">
              {SCHEDULE_PART_SEPARATOR}
              {t("unrecordedSessions", { count: club.unrecordedCount })}
            </span>
          )}
        </td>
        {/* The money axis. The last column's right edge is the row inset, which
            is the same edge the municipality total and the month total end on. */}
        <td className="py-1 text-right tabular-nums">
          {club.totalCents === null ? (
            <FeeNotSet />
          ) : (
            formatCurrencyFromCents(club.totalCents, "eur", locale)
          )}
        </td>
      </tr>
      {isOpen && (
        <tr id={detailId}>
          {/* The detail is indented under the club's own name, on the same
              ground: an indent and the divider above it are what say *these
              belong to that*, and lifting a run of rows off the rows around
              them would make the club's dates read as a different kind of thing
              from the club. */}
          <td />
          <td colSpan={5} className="pb-2">
            <ClubSessionDetail club={club} locale={locale} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Every date behind one club's number: when it was, which week that is, what
 * happened, and what it is worth.
 *
 * It is a nested `table-fixed` whose last column is right-aligned, so its
 * amounts land on the same axis as the club total above them without having to
 * agree with the outer table's column widths — only with its right edge.
 *
 * It carries no header row of its own. The outer table already named its columns
 * once for the whole municipality, and a second header row per opened club would
 * spend a line on labelling four values a reader can tell apart by their shape:
 * a date, a week number, a word, and a sum of money.
 */
function ClubSessionDetail({
  club,
  locale,
}: {
  club: InvoiceClub;
  locale: string;
}) {
  return (
    <table className="w-full table-fixed text-xs">
      {/* The widths live in a `colgroup` rather than on the first row's cells,
          because the first row is not always a session: a club that meets
          somewhere states where above its dates, spanning the lot, and a fixed
          layout reading its widths off a spanning row would have none to read. */}
      <colgroup>
        <col className="w-[32%]" />
        <col className="w-[14%]" />
        <col className="w-[30%]" />
        <col className="w-[24%]" />
      </colgroup>
      <tbody>
        {/* Where it meets, stated once above its dates rather than in the club's
            own line, where the name and four figures already have the width
            spoken for. */}
        {club.locationName !== null && (
          <tr>
            <td colSpan={4} className="pb-0.5 text-muted-foreground">
              {club.locationName}
            </td>
          </tr>
        )}
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
      <td className="py-0.5 pr-2">
        <span className="flex items-baseline gap-1.5">
          <span>{formatDateOnly(session.date, locale, { weekday: "short" })}</span>
          <span className="tabular-nums">
            {formatDateOnly(session.date, locale, {
              day: "numeric",
              month: "numeric",
              year: "numeric",
            })}
          </span>
        </span>
      </td>
      <td className="py-0.5 pr-2 tabular-nums">
        {c("week", { week: session.isoWeek })}
      </td>
      <td className="py-0.5 pr-2">
        <span className="flex items-center gap-1">
          {session.kind === "unrecorded" && (
            <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
          )}
          {session.kind === "recorded" && t("recorded")}
          {session.kind === "unrecorded" && t("notRecorded")}
          {session.kind === "upcoming" && t("upcoming")}
        </span>
      </td>
      {/* The money column, ending on the same axis as the club's own total. An
          amount with a word beside it flows leftward into the column's slack
          rather than pushing the figure off that axis. */}
      <td className="py-0.5 text-right tabular-nums">
        <span className="flex items-baseline justify-end gap-1.5">
          {session.kind === "recorded" &&
            (feeCents === null ? (
              <FeeNotSet />
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
