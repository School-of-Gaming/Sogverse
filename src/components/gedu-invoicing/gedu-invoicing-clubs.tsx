"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  DatedLine,
  DatedLinesTable,
  DisclosureButton,
  LedgerFlag,
  LedgerHeaderRow,
  type DatedLineTone,
} from "@/components/invoicing-ledger/ledger";
import { ROUTES } from "@/lib/constants";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import { formatCurrencyFromCents } from "@/lib/utils";
import type {
  GeduInvoice,
  GeduInvoiceClub,
  GeduInvoiceLine,
  GeduInvoiceLineKind,
  GeduInvoicePerson,
  GeduInvoiceSegment,
} from "./build-gedu-invoicing";

/**
 * Who is reading a gedu's clubs. The two readers see the same figures and the
 * same lines; what differs is what an unset fee is to them. To an admin it is a
 * task: the fee is flagged, and the club's name goes to its admin page, where
 * the fee is set. To a gedu it is nothing to act on — by the time they invoice,
 * the fee is set — so the cell is a plain dash and the name goes nowhere.
 */
export type GeduInvoicingAudience = "admin" | "gedu";

/**
 * One gedu's clubs as one table: club, role, fee, sessions, total — the same
 * five facts in the same order the municipality ledger reads a club, with the
 * role in place of the schedule, because the role is what picks the fee.
 *
 * **Grouped under the two sums a gedu's invoice itemises**, municipality and
 * then consumer, each under a furniture label, so the table reads in
 * the order the invoice is written in. One `table-fixed` for the gedu, so every
 * club's columns land where the club above them did and the total column ends
 * on the ledger's one money axis.
 */
export function GeduClubTable({
  gedu,
  locale,
  audience,
  clubsStartOpen,
}: {
  gedu: GeduInvoice;
  locale: string;
  audience: GeduInvoicingAudience;
  /**
   * Whether each club's dated lines are open on arrival. A gedu reading their
   * own month has a handful of clubs and the dates are what they check against
   * their own records; an admin reading everybody's has the working one click
   * away from each line.
   */
  clubsStartOpen: boolean;
}) {
  const t = useTranslations("geduInvoicing");
  const segments = SEGMENT_ORDER.map((segment) => ({
    segment,
    clubs: gedu.clubs.filter((club) => club.segment === segment),
  })).filter(({ clubs }) => clubs.length > 0);

  return (
    <table className="w-full min-w-[46rem] table-fixed text-sm">
      <thead>
        <LedgerHeaderRow>
          {/* The disclosure column. It has no name because the control in it is
              named per club, by the club it belongs to. */}
          <th scope="col" className="w-7" />
          <th scope="col" className="py-1.5 pr-2 text-left font-medium">
            {t("columnClub")}
          </th>
          <th scope="col" className="w-[16%] py-1.5 pr-2 text-left font-medium">
            {t("columnRole")}
          </th>
          <th scope="col" className="w-[14%] py-1.5 pr-2 text-right font-medium">
            {t("columnFee")}
          </th>
          <th scope="col" className="w-[16%] py-1.5 pr-2 text-right font-medium">
            {t("columnSessions")}
          </th>
          <th scope="col" className="w-[16%] py-1.5 text-right font-medium">
            {t("columnTotal")}
          </th>
        </LedgerHeaderRow>
      </thead>
      {segments.map(({ segment, clubs }) => (
        <tbody
          key={segment}
          className="divide-y divide-border border-t border-border"
        >
          <tr>
            <td />
            {/* Furniture, cased with the column headers above it: a label a
                reader scans for structure, not a sentence. */}
            <th
              scope="rowgroup"
              colSpan={5}
              className="pb-1 pt-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {t(SEGMENT_LABEL_KEY[segment])}
            </th>
          </tr>
          {clubs.map((club) => (
            <GeduClubRows
              key={`${club.productId}|${club.role}`}
              club={club}
              locale={locale}
              audience={audience}
              startOpen={clubsStartOpen}
            />
          ))}
        </tbody>
      ))}
    </table>
  );
}

const SEGMENT_ORDER: readonly GeduInvoiceSegment[] = ["municipality", "consumer"];

const SEGMENT_LABEL_KEY = {
  municipality: "segmentMunicipality",
  consumer: "segmentConsumer",
} as const satisfies Record<GeduInvoiceSegment, string>;

/**
 * One club, in one role, and the dates behind its number when opened.
 *
 * The total is the product of the fee and the sessions to its left, so the
 * multiplication is checkable without leaving the row. A club with a missed
 * session says so in its count cell, in warning tone, so a month's problems are
 * visible with every club closed. The whole row takes the click and the chevron
 * is the keyboard target — the ledger's one disclosure shape — and an admin's
 * club name is the one thing on it that does not open it.
 */
function GeduClubRows({
  club,
  locale,
  audience,
  startOpen,
}: {
  club: GeduInvoiceClub;
  locale: string;
  audience: GeduInvoicingAudience;
  startOpen: boolean;
}) {
  const t = useTranslations("geduInvoicing");
  const [isOpen, setIsOpen] = useState(startOpen);
  const detailId = useId();
  const roleLabel = t(ROLE_LABEL_KEY[club.role]);

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
            label={t("sessionsFor", { club: club.name, role: roleLabel })}
            // The detail is a `<tr>`, which has nowhere to hide while shut, so
            // the control names it only while it exists.
            controls={isOpen ? detailId : undefined}
            size="row"
          />
        </td>
        {/* The truncation is the cell's and the anchor stays inline, so the
            link is exactly its own words and the rest of the cell falls through
            to the row's click — the municipality ledger's rule, for its
            reason. */}
        <td className="truncate py-2 pr-2" title={club.name}>
          {audience === "admin" ? (
            <Link
              href={ROUTES.admin.product(club.productType, club.productId)}
              onClick={(event) => event.stopPropagation()}
              className="font-medium hover:underline"
            >
              {club.name}
            </Link>
          ) : (
            <span className="font-medium">{club.name}</span>
          )}
        </td>
        <td className="truncate py-2 pr-2 text-xs text-muted-foreground">
          {roleLabel}
        </td>
        <td className="py-2 pr-2 text-right tabular-nums">
          {club.feeCents === null ? (
            <UnsetFee audience={audience} />
          ) : (
            formatCurrencyFromCents(club.feeCents, "eur", locale)
          )}
        </td>
        {/* The warning first and the count last, so the count ends on the
            column's edge and the note flows leftward into its slack. */}
        <td className="py-2 pr-2 text-right tabular-nums">
          {club.unrecordedCount > 0 && (
            <span className="whitespace-nowrap text-xs font-medium text-warning">
              {t("unrecordedCount", { count: club.unrecordedCount })}
              {SCHEDULE_PART_SEPARATOR}
            </span>
          )}
          {club.paidCount}
        </td>
        <td className="py-2 text-right tabular-nums">
          {club.totalCents === null ? (
            <UnsetFee audience={audience} />
          ) : (
            formatCurrencyFromCents(club.totalCents, "eur", locale)
          )}
        </td>
      </tr>
      {isOpen && (
        <tr id={detailId}>
          {/* Indented under the club's name on the same ground: the indent and
              the rule above are what say these dates belong to that club. */}
          <td />
          <td colSpan={5} className="pb-2 pt-1">
            <GeduClubLines club={club} locale={locale} audience={audience} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Where a fee, or a figure the fee multiplies into, would be but nobody has set
 * it. The admin sees the flag of a task; the gedu sees a neutral dash, with no
 * warning and nothing to do.
 */
function UnsetFee({ audience }: { audience: GeduInvoicingAudience }) {
  const t = useTranslations("geduInvoicing");
  return audience === "admin" ? (
    <LedgerFlag label={t("feeNotSet")} />
  ) : (
    <span className="text-muted-foreground">{NO_FIGURE}</span>
  );
}

/**
 * The gedu's unset-fee cell. Punctuation rather than copy — a dash says "no
 * figure" in every locale — so it is written here and not in five message files.
 */
const NO_FIGURE = "—";

const ROLE_LABEL_KEY = {
  primary: "rolePrimary",
  assistant: "roleAssistant",
} as const;

/**
 * Every dated seat behind one club's number.
 *
 * The group rides on a line only where the club's lines span more than one
 * group: a gedu at two groups of one club ran two sessions on a shared date,
 * and the two lines are told apart by nothing else. With one group it would be
 * the same word on every line.
 */
function GeduClubLines({
  club,
  locale,
  audience,
}: {
  club: GeduInvoiceClub;
  locale: string;
  audience: GeduInvoicingAudience;
}) {
  const showsGroup = new Set(club.lines.map((line) => line.groupId)).size > 1;

  return (
    <DatedLinesTable heading={club.locationName}>
      {club.lines.map((line) => (
        <GeduLineRow
          key={`${line.date}|${line.groupId}`}
          line={line}
          feeCents={club.feeCents}
          locale={locale}
          audience={audience}
          showsGroup={showsGroup}
        />
      ))}
    </DatedLinesTable>
  );
}

/**
 * One dated seat. The five kinds read differently on purpose:
 *
 * - **Recorded** is the ordinary case and carries the fee and nothing else.
 * - **Not recorded** is a past date the gedu was expected at with nothing on
 *   record, in warning tone at zero — a zero with no word beside it would read
 *   as a free session.
 * - **Upcoming** carries no amount at all: it has not happened.
 * - **Cancelled** is settled and quiet at zero.
 * - **Away** is the gedu's own absence, quiet at zero, and names who stood in —
 *   or says nobody has — so a gedu can see why a date they hold did not pay.
 *
 * A seat held as a substitute names the gedu it stood in for, whatever became of
 * the date. Both names are shown on both readers: the requester sees their own
 * request's substitute, and a seated sub is staff on the group, to whom the
 * absent gedu is disclosed.
 */
function GeduLineRow({
  line,
  feeCents,
  locale,
  audience,
  showsGroup,
}: {
  line: GeduInvoiceLine;
  feeCents: number | null;
  locale: string;
  audience: GeduInvoicingAudience;
  showsGroup: boolean;
}) {
  const t = useTranslations("geduInvoicing");
  const zero = formatCurrencyFromCents(0, "eur", locale);

  return (
    <DatedLine
      date={line.date}
      isoWeek={line.isoWeek}
      locale={locale}
      tone={LINE_TONE[line.kind]}
      context={showsGroup ? line.groupName : null}
      outcome={
        line.kind === "absent"
          ? line.substitute === null
            ? t("absentNoSubstitute")
            : t("absentSubstituted", { name: fullName(line.substitute) })
          : t(LINE_OUTCOME_KEY[line.kind])
      }
      note={
        line.coveringFor === null
          ? null
          : t("substitutingFor", { name: fullName(line.coveringFor) })
      }
      amount={
        line.kind === "paid" ? (
          feeCents === null ? (
            <UnsetFee audience={audience} />
          ) : (
            formatCurrencyFromCents(feeCents, "eur", locale)
          )
        ) : line.kind === "upcoming" ? null : (
          zero
        )
      }
    />
  );
}

const LINE_TONE = {
  paid: "plain",
  unrecorded: "warning",
  upcoming: "muted",
  cancelled: "muted",
  absent: "muted",
} as const satisfies Record<GeduInvoiceLineKind, DatedLineTone>;

const LINE_OUTCOME_KEY = {
  paid: "recorded",
  unrecorded: "notRecorded",
  upcoming: "upcoming",
  cancelled: "cancelled",
} as const satisfies Record<Exclude<GeduInvoiceLineKind, "absent">, string>;

/** A gedu as a reader names them — both names, as the rest of staff copy does. */
export function fullName(person: Pick<GeduInvoicePerson, "firstName" | "lastName">) {
  return `${person.firstName} ${person.lastName}`;
}
