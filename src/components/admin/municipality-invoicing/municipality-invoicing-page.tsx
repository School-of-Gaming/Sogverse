"use client";

import { useId, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileDown, TriangleAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CountLine,
  CountLineWarning,
  DatedLine,
  DatedLinesTable,
  DisclosureButton,
  LedgerFlag,
  LedgerHeaderRow,
  LedgerSection,
  LedgerSummaryLine,
} from "@/components/invoicing-ledger/ledger";
import {
  MonthStepper,
  type MonthHref,
} from "@/components/invoicing-ledger/month-stepper";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { useNow } from "@/providers";
import { finvoiceHref, finvoiceReadiness } from "@/lib/finvoice";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import { formatCurrencyFromCents } from "@/lib/utils";
import type { MunicipalityInvoicingSnapshot } from "@/services/municipality-invoicing";
import { useMunicipalityInvoicingMonth } from "@/services/municipality-invoicing";
import {
  buildMunicipalityInvoicing,
  type InvoiceClub,
  type InvoiceCustomerSummary,
  type InvoiceMunicipality,
  type InvoiceSession,
  type MunicipalityInvoicingView,
} from "./build-municipality-invoicing";

/**
 * **Municipality invoicing** — one month, one municipality at a time.
 *
 * The page the CFO opens once a month to raise the invoices. It is read-only
 * from end to end: every number on it is derived at read time from the clubs'
 * current fees, schedules, recorded sessions and cancellations, and nothing here
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
  now: pinnedNow,
  monthHref: monthHrefProp,
}: {
  /** The month on screen, as its first day (`YYYY-MM-01`). */
  monthStart: string;
  initialSnapshot: MunicipalityInvoicingSnapshot;
  /**
   * A clock to read the month against, instead of the live one.
   *
   * Only the preview scene passes it, and it is a prop rather than a provider
   * the scene could wrap because the provider's whole job is to *tick*: a
   * fixture month pinned to one instant and a clock that moves to the real one
   * thirty seconds later would reclassify every line on the page — today's
   * recorded session and next week's upcoming ones both — while somebody was
   * looking at it. Absent, which is every deployment, the page reads the live
   * clock exactly as it did.
   */
  now?: Date;
  /**
   * Where a step of the month stepper goes, given the month it steps to.
   *
   * It defaults to the live admin route, which is the only answer a deployment
   * ever wants. The preview scene passes its own, pointing back at itself,
   * because a stepper that leaves the preview is a control the reviewer cannot
   * use on the page they are reviewing — and stepping the month is how the
   * preview reaches the one state a month with clubs in it cannot show.
   */
  monthHref?: (month: string) => MonthHref;
}) {
  const monthHref = monthHrefProp ?? adminMonthHref;
  const t = useTranslations("admin.municipalityInvoicing");
  const locale = resolveLocale(useLocale());
  const liveNow = useNow();
  const now = pinnedNow ?? liveNow;
  const { data: snapshot } = useMunicipalityInvoicingMonth(
    monthStart,
    initialSnapshot,
  );

  const invoice = useMemo(
    () => buildMunicipalityInvoicing({ snapshot, locale, now }),
    [snapshot, locale, now],
  );

  // Collapsed is the default, so the set holds what is *open* — an empty set is
  // the opening state and needs no list of every municipality to express it.
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  /**
   * Which sections are open belongs to the month they were opened in.
   *
   * The shell stays mounted across a step to another month, and a municipality
   * keeps its id from one month to the next, so without this reset April opens
   * with exactly May's sections expanded — a page claiming the reader opened
   * something they have not looked at yet. Reset during render rather than from
   * an effect, so no frame is painted with the wrong month's expansions.
   */
  const [shownMonth, setShownMonth] = useState(monthStart);
  if (shownMonth !== monthStart) {
    setShownMonth(monthStart);
    setOpenKeys(new Set<string>());
  }

  const allOpen =
    invoice.municipalities.length > 0 &&
    invoice.municipalities.every((one) => openKeys.has(one.id));

  return (
    // The scroll gutter is reserved because expanding a municipality is itself
    // what makes the document scrollbar appear: without it, the reader's own
    // click narrows the page under the figures they were reading and moves every
    // one of them sideways.
    <div className="space-y-3 pb-12" data-reserve-scroll-gutter>
      <MunicipalityInvoicingHeading />

      {/* At least as tall as the small button, so a month with nothing to
          expand does not lose it and pull the stepper up the page. */}
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        <MonthStepper
          monthStart={invoice.monthStart}
          locale={locale}
          monthHref={monthHref}
          previousLabel={t("previousMonth")}
          nextLabel={t("nextMonth")}
        />
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
                  : new Set(invoice.municipalities.map((one) => one.id)),
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
                key={municipality.id}
                municipality={municipality}
                monthStart={invoice.monthStart}
                locale={locale}
                isOpen={openKeys.has(municipality.id)}
                onToggle={() =>
                  setOpenKeys((keys) => {
                    const next = new Set(keys);
                    if (!next.delete(municipality.id)) {
                      next.add(municipality.id);
                    }
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

export type { MonthHref };

/** The live page's own answer: another month of this route. */
function adminMonthHref(month: string): MonthHref {
  return { pathname: ROUTES.admin.municipalityInvoicing, query: { month } };
}

/**
 * The page's title and its one-line description — the two things on it that wait
 * on nothing.
 *
 * It is a component rather than two lines written out twice, because the route
 * renders them above a failed read as well, where there is no invoice to put
 * underneath. The two copies had already drifted apart — a display heading over
 * the failure, a working-surface heading over the ledger — and a page whose title
 * changes size depending on whether the month loaded looks broken in exactly the
 * state where the reader is already being told that something went wrong.
 *
 * The size is the smallest that still reads as the page's own title: this is a
 * working surface rather than a page somebody arrives at, and a display heading
 * over a dense ledger spends a tenth of the first screen naming what the sidebar
 * named already.
 */
export function MunicipalityInvoicingHeading() {
  const t = useTranslations("admin.municipalityInvoicing");

  return (
    <div>
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
    </div>
  );
}

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
    <LedgerSummaryLine
      facts={
        <>
          <CountLine
            parts={[
              t("municipalityCount", { count: invoice.municipalityCount }),
              t("clubCount", { count: invoice.clubCount }),
              t("sessionCount", { count: invoice.billedCount }),
            ]}
          />
          {invoice.clubsWithoutFee > 0 && (
            <ExcludedClubs count={invoice.clubsWithoutFee} />
          )}
          {invoice.clubsWithoutCustomer > 0 && (
            <ClubsWithoutCustomer count={invoice.clubsWithoutCustomer} />
          )}
        </>
      }
      caption={t("monthTotal")}
      figure={formatCurrencyFromCents(invoice.totalCents, "eur", locale)}
    />
  );
}

/** The one phrase that says a total is short, wherever a total is printed. */
function ExcludedClubs({ count }: { count: number }) {
  const t = useTranslations("admin.municipalityInvoicing");

  return <CountLineWarning>{t("excludedClubs", { count })}</CountLineWarning>;
}

/**
 * The phrase that says a *file* is blocked, wherever a count of clubs is
 * printed.
 *
 * Deliberately a second phrase beside `ExcludedClubs` rather than a wider
 * version of it, because the two say opposite things about the figure they sit
 * next to: a club with no fee is missing from the total on this line, and a
 * club with no customer is missing from nothing at all — its sessions and its
 * money are here in full, and what it lacks is somebody to address the invoice
 * to. Read as one warning they would each be wrong about the other's clubs.
 */
function ClubsWithoutCustomer({ count }: { count: number }) {
  const t = useTranslations("admin.municipalityInvoicing");

  return (
    <CountLineWarning>
      {t("clubsWithoutCustomer", { count })}
    </CountLineWarning>
  );
}

/** A fee, or a total, that cannot be stated because nobody has set the fee. */
function FeeNotSet() {
  const t = useTranslations("admin.municipalityInvoicing");

  return <LedgerFlag label={t("feeNotSet")} />;
}

/**
 * A club nobody has named a buyer for, flagged on its own line.
 *
 * The same shape as the missing fee beside it — triangle, warning tone, one
 * phrase — because they are the same kind of thing to the reader: a gap in a
 * club's setup that this page found and its own admin page repairs. It carries
 * no link of its own; the club's name is already a link to exactly that page,
 * and a second anchor on one row would give the reader two targets for one
 * repair.
 */
function CustomerNotSet() {
  const t = useTranslations("admin.municipalityInvoicing");

  return <LedgerFlag label={t("customerNotSet")} />;
}

/**
 * A municipality's Finvoice downloads: one per Fennoa customer among its clubs.
 *
 * **One control per customer, not per municipality**, because one file is one
 * customer's whole month — a city that buys library clubs and school clubs
 * under two agreements imports two files, and an association that buys clubs
 * sited in three municipalities imports one. So the same control appears on
 * every municipality the customer's clubs sit in and fetches the same file from
 * each, which is the honest rendering of a buyer that spans sections.
 *
 * **A blocked file is shown as blocked rather than hidden**, with the reason in
 * the same warning tone the rest of this page reports a gap in: a control that
 * disappeared when a club lost its fee would leave the CFO looking for a file
 * with nothing on the page saying why it is not there. It is a `span` rather
 * than a disabled anchor because an anchor with no destination is not inert.
 *
 * The readiness comes from the export's own predicate, so the state of this
 * control and the answer the download route gives cannot disagree.
 */
function CustomerFiles({
  monthStart,
  customers,
}: {
  monthStart: string;
  customers: readonly InvoiceCustomerSummary[];
}) {
  if (customers.length === 0) return null;

  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
      {customers.map((summary) => (
        <CustomerFile
          key={summary.customer.id}
          monthStart={monthStart}
          summary={summary}
        />
      ))}
    </span>
  );
}

function CustomerFile({
  monthStart,
  summary,
}: {
  monthStart: string;
  summary: InvoiceCustomerSummary;
}) {
  const t = useTranslations("admin.municipalityInvoicing");
  const { customer } = summary;
  const readiness = finvoiceReadiness(summary);

  const label = (
    <>
      <span className="truncate">{customer.invoice_name}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {customer.fennoa_customer_no}
      </span>
    </>
  );

  if (!readiness.ok) {
    return (
      <span className="flex min-w-0 items-baseline gap-1.5 text-xs text-warning">
        <TriangleAlert className="h-3 w-3 shrink-0 self-center" aria-hidden />
        {label}
        <span className="shrink-0 font-medium">
          {readiness.reason === "club_without_fee"
            ? t("fileBlockedByFee", { count: readiness.clubsWithoutFee })
            : t("fileBlockedByNothingToInvoice")}
        </span>
      </span>
    );
  }

  return (
    <a
      href={finvoiceHref(monthStart, customer.id)}
      download
      // The row around this is listening for a click to open the municipality.
      // Left to bubble, asking for a file would also expand the section it was
      // asked for from.
      onClick={(event) => event.stopPropagation()}
      title={t("downloadInvoiceFor", { customer: customer.invoice_name })}
      className="flex min-w-0 items-baseline gap-1.5 text-xs text-act hover:underline"
    >
      <FileDown className="h-3 w-3 shrink-0 self-center" aria-hidden />
      {label}
    </a>
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
 * **It is also where a month is actually sent.** The line carries one download
 * per Fennoa customer among its clubs, so the CFO works down the collapsed
 * ledger taking one file per buyer without opening anything — which is what
 * makes closing everything by default affordable for the half of this page that
 * is a job rather than a report.
 *
 * The line is identical open and closed, which is what keeps the layout rule
 * satisfied: expanding adds the clubs underneath and moves nothing the reader
 * was already looking at, and it is their own click that did it.
 */
function MunicipalitySection({
  municipality,
  monthStart,
  locale,
  isOpen,
  onToggle,
}: {
  municipality: InvoiceMunicipality;
  /** The month on screen — what a customer's file is asked for. */
  monthStart: string;
  locale: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("admin.municipalityInvoicing");

  // The line carries links — one download per customer — which is why it is
  // not itself a button; the shared section is the arrangement that has an
  // answer for that.
  return (
    <LedgerSection
      isOpen={isOpen}
      onToggle={onToggle}
      toggleLabel={t("clubsIn", { municipality: municipality.name })}
      line={
        <>
          <span className="shrink-0 text-sm font-semibold">
            {municipality.name}
          </span>
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            <CountLine
              parts={[
                t("clubCount", { count: municipality.clubs.length }),
                t("sessionCount", { count: municipality.billedCount }),
              ]}
            />
            {municipality.clubsWithoutFee > 0 && (
              <ExcludedClubs count={municipality.clubsWithoutFee} />
            )}
            {municipality.clubsWithoutCustomer > 0 && (
              <ClubsWithoutCustomer count={municipality.clubsWithoutCustomer} />
            )}
          </span>
          {/* The files sit between the counts and the money, which is where they
              belong in the reading: what ran, what can be sent, what it comes to.
              They take the line's slack and the total keeps the axis. */}
          <span className="ml-auto flex min-w-0 justify-end">
            <CustomerFiles
              monthStart={monthStart}
              customers={municipality.customers}
            />
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {formatCurrencyFromCents(municipality.totalCents, "eur", locale)}
          </span>
        </>
      }
    >
      <ClubTable municipality={municipality} locale={locale} />
    </LedgerSection>
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
        <LedgerHeaderRow>
          {/* The disclosure column. It has no name because the control in it is
              named per club, by the club it belongs to. */}
          <th scope="col" className="w-7" />
          <th scope="col" className="py-1.5 pr-2 text-left font-medium">
            {t("columnClub")}
          </th>
          <th scope="col" className="w-[22%] py-1.5 pr-2 text-left font-medium">
            {t("columnSchedule")}
          </th>
          <th scope="col" className="w-[14%] py-1.5 pr-2 text-right font-medium">
            {t("columnFee")}
          </th>
          <th scope="col" className="w-[14%] py-1.5 pr-2 text-right font-medium">
            {t("columnSessions")}
          </th>
          <th scope="col" className="w-[16%] py-1.5 text-right font-medium">
            {t("columnTotal")}
          </th>
        </LedgerHeaderRow>
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
 * meets, what a session of it costs, how many bill, and what that comes to. The
 * total is the product of the two columns to its left, so a reader can check the
 * multiplication without leaving the row — which is the whole reason the fee is
 * on the line at all rather than only in the detail.
 *
 * **A club billed for sessions nobody wrote up says so on its own line.** The
 * count cell carries how many of its billed sessions are not recorded, in quiet
 * secondary type beside the billed count, so a missing write-up can be chased
 * without opening anything — which matters because every club here is closed
 * by default. It is not a warning: those sessions are in the count and the
 * total, and nothing about the invoice is wrong. Dates still ahead of the club
 * and cancelled dates get no mention there.
 *
 * **The whole row toggles the dates, and the club's name is the one thing on it
 * that does not.** A row this dense is read by pointing at it, and a reader
 * aiming for a five-pixel chevron to see why a number is what it is has been
 * given a target and not an affordance — so the row takes the click, fills on
 * hover, and the name stops the click from travelling.
 *
 * **The chevron button remains the keyboard target, and the row's click is a
 * pointer convenience layered over it.** The alternative — `role="button"` and
 * `tabIndex` on the row itself — would put the club's link *inside* a control,
 * which is the one arrangement that makes both of them ambiguous: nested
 * interactive content has no correct answer for a keyboard or a screen reader,
 * and this codebase's own disclosures are all real `<button>`s carrying their own
 * name, `aria-expanded` and focus ring. So the accessible disclosure is the
 * button, exactly as it was, and nothing a keyboard can reach has changed.
 *
 * The club name links to its admin page, which is the whole repair path for the
 * one thing this page can find wrong — a fee nobody has filled in — so the link
 * is there whether or not the fee is missing.
 */
function ClubRows({ club, locale }: { club: InvoiceClub; locale: string }) {
  const t = useTranslations("admin.municipalityInvoicing");
  const [isOpen, setIsOpen] = useState(false);
  const detailId = useId();

  return (
    <>
      <tr
        onClick={() => setIsOpen((open) => !open)}
        className="cursor-pointer align-baseline transition-colors hover:bg-hover"
      >
        <td className="py-2">
          <DisclosureButton
            isOpen={isOpen}
            onToggle={() => setIsOpen((open) => !open)}
            label={t("sessionsFor", { club: club.name })}
            // Named only while the region it names exists: the detail row is a
            // `<tr>`, so it cannot stay mounted inside a collapsed wrapper the
            // way the municipality's region does.
            controls={isOpen ? detailId : undefined}
            size="row"
          />
        </td>
        {/* Truncated with the whole name on hover: a product name runs long and a
            column that grows to fit the longest one takes the width the figures
            need.
            **The truncation is the cell's and the anchor stays inline**, which is
            what makes the anchor's box end where its text ends. Given `block` or
            `w-full` it filled the cell, so the whole width of the Club column
            navigated away — including the empty space after a short name, which is
            the part of a row a reader is most likely to click when they meant to
            open it. An inline anchor is exactly its own words: the rest of the cell
            falls through to the row's handler, and the cell clips a long name to
            the column as the schedule cell beside it does. Inline also keeps the
            name on the row's shared baseline, which an `inline-block` with
            `overflow: hidden` would not — such a box takes its bottom edge as its
            baseline and would sit the name off the axis of the figures beside it.
            The click is stopped here and nowhere else, and the underline on hover
            marks exactly the text that leaves the row. */}
        {/* The truncation moved one level in when the customer flag arrived, so
            the name still clips to whatever the flag leaves it and the anchor
            still sits inline inside the clipping box — the part that matters is
            that the anchor is its own words rather than the cell's width. */}
        <td className="py-2 pr-2">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 truncate">
              <Link
                href={ROUTES.admin.product("municipality_club", club.id)}
                title={club.name}
                onClick={(event) => event.stopPropagation()}
                className="font-medium hover:underline"
              >
                {club.name}
              </Link>
            </span>
            {/* Beside the name rather than in a column of its own: it is a fact
                about who this club is billed to, and the repair is the link it
                sits next to. */}
            {club.invoiceCustomer === null && <CustomerNotSet />}
          </span>
        </td>
        <td
          className="truncate py-2 pr-2 text-xs text-muted-foreground"
          title={club.scheduleSummary ?? undefined}
        >
          {club.scheduleSummary}
        </td>
        <td className="py-2 pr-2 text-right tabular-nums">
          {club.feeCents === null ? (
            <FeeNotSet />
          ) : (
            formatCurrencyFromCents(club.feeCents, "eur", locale)
          )}
        </td>
        {/* The note comes first and the count last, so the count ends on the
            column's right edge like every other figure on the page and the note
            flows leftward into the column's slack. The note is quiet secondary
            type rather than a warning: the sessions it counts are billed and
            already inside the count beside it, and it is there only so a
            missing write-up can be chased. Both halves are one phrase per
            locale, joined by punctuation rather than by copy, so no locale has
            to word the pair. */}
        <td className="py-2 pr-2 text-right tabular-nums">
          {club.unrecordedCount > 0 && (
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {t("unrecordedSessions", { count: club.unrecordedCount })}
              {SCHEDULE_PART_SEPARATOR}
            </span>
          )}
          {club.billedCount}
        </td>
        {/* The money axis. The last column's right edge is the row inset, which
            is the same edge the municipality total and the month total end on. */}
        <td className="py-2 text-right tabular-nums">
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
          <td colSpan={5} className="pb-2 pt-1">
            <ClubSessionDetail club={club} locale={locale} />
          </td>
        </tr>
      )}
    </>
  );
}

/** Every date behind one club's number, on the ledger's shared dated-lines table. */
function ClubSessionDetail({
  club,
  locale,
}: {
  club: InvoiceClub;
  locale: string;
}) {
  // Where it meets is stated once above its dates rather than on the club's
  // own line, where the name and four figures already have the width spoken
  // for.
  return (
    <DatedLinesTable heading={club.locationName}>
      {club.sessions.map((session) => (
        <SessionRow
          key={session.date}
          session={session}
          feeCents={club.feeCents}
          locale={locale}
        />
      ))}
    </DatedLinesTable>
  );
}

/**
 * One dated line: when it was and what became of it, read as one phrase, and
 * what it is worth.
 *
 * The four kinds read differently on purpose. A recorded session carries the
 * fee and nothing else in the way of explanation — it is the ordinary case and
 * should be quiet. An unrecorded one carries the same fee, muted, and says in
 * words that it is billed without a record: nothing about the invoice is wrong,
 * but a reader chasing write-ups has to be able to find it. An upcoming one
 * carries no amount at all: it has not happened, and printing €0 against a date
 * in the future would invite somebody to go looking for a session nobody has
 * missed. A cancelled one is muted and worth €0, past or future: it is settled,
 * and the word beside the zero is what tells it apart from a billed one.
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

  return (
    <DatedLine
      date={session.date}
      isoWeek={session.isoWeek}
      locale={locale}
      tone={session.kind === "recorded" ? "plain" : "muted"}
      outcome={t(SESSION_OUTCOME_KEY[session.kind])}
      amount={
        session.kind === "recorded" || session.kind === "unrecorded" ? (
          feeCents === null ? (
            <FeeNotSet />
          ) : (
            formatCurrencyFromCents(feeCents, "eur", locale)
          )
        ) : session.kind === "upcoming" ? null : (
          formatCurrencyFromCents(0, "eur", locale)
        )
      }
    />
  );
}

const SESSION_OUTCOME_KEY = {
  recorded: "recorded",
  unrecorded: "billedNotRecorded",
  upcoming: "upcoming",
  cancelled: "cancelled",
} as const satisfies Record<InvoiceSession["kind"], string>;
