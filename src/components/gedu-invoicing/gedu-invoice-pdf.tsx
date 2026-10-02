import { join } from "node:path";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { FACES } from "@sog/ui";
import { PRINT_INK } from "@/lib/constants/colors";
import {
  DEFAULT_TIMEZONE,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { formatCurrencyFromCents, formatDate, formatDateOnly } from "@/lib/utils";
import { fullName, type GeduInvoice } from "./build-gedu-invoicing";
import type { GeduInvoicingTranslator } from "./gedu-invoice-export";
import {
  NO_FIGURE,
  ROLE_LABEL_KEY,
  SEGMENT_LABEL_KEY,
  SEGMENT_ORDER,
} from "./gedu-invoicing-labels";

/**
 * One gedu's month as a PDF work statement, A4, to attach to the invoice the
 * gedu writes in their own tool. It is not an invoice: it carries no invoice
 * number, no VAT and no payment terms.
 *
 * **A frozen copy of a page that freezes nothing.** The page recomputes every
 * figure on every read, so the statement says when its figures were taken, in
 * Helsinki time, and says so loudly while the month still has sessions ahead.
 *
 * It leads with the two sums the Gedu handbook asks gedus to itemise, then the
 * club lines they come from, then the dates of the sessions that pay. Dates
 * that pay nothing — away, cancelled, not recorded, upcoming — are the page's
 * business, not the statement's. An unset fee reads as a neutral dash, as on
 * the gedu's page.
 *
 * The content is shaped by a pure function and drawn by a dumb document, so
 * the tests can read what the statement says without parsing a PDF.
 */

export interface GeduInvoicePdfArgs {
  invoice: GeduInvoice;
  /** The month, as its first day (`YYYY-MM-01`). */
  monthStart: string;
  locale: SupportedLocale;
  /** When the figures were read — the statement's own timestamp. */
  now: Date;
  t: GeduInvoicingTranslator;
}

export interface GeduInvoicePdfContent {
  title: string;
  geduName: string;
  geduEmail: string;
  month: string;
  to: string;
  figuresAsOf: string;
  /** Shown while any line of the month is still upcoming. */
  monthInProgress: string | null;
  summaryHeading: string;
  summary: readonly { label: string; figure: string; isTotal: boolean }[];
  amountsNote: string;
  clubsHeading: string;
  clubColumns: {
    club: string;
    role: string;
    sessions: string;
    fee: string;
    total: string;
  };
  /** Municipality first, then consumer; a segment with no club is left out. */
  segments: readonly {
    label: string;
    clubs: readonly {
      /** With the role, what tells two lines apart: club names repeat. */
      productId: string;
      club: string;
      role: string;
      sessions: string;
      fee: string;
      total: string;
    }[];
  }[];
  sessionsHeading: string;
  sessionColumns: { date: string; group: string };
  /** Club lines with at least one paying session, in the club table's order. */
  sessionsByClub: readonly {
    productId: string;
    role: string;
    heading: string;
    sessions: readonly { date: string; group: string }[];
  }[];
  /** Shown in place of the session detail when nothing pays. */
  noSessions: string;
  pageLabel: (page: number, pages: number) => string;
}

/** Everything the statement says, worded and formatted. Pure. */
export function geduInvoicePdfContent({
  invoice,
  monthStart,
  locale,
  now,
  t,
}: GeduInvoicePdfArgs): GeduInvoicePdfContent {
  const money = (cents: number | null) =>
    cents === null
      ? NO_FIGURE
      : pdfText(formatCurrencyFromCents(cents, "eur", locale));
  const role = (club: GeduInvoice["clubs"][number]) =>
    t(ROLE_LABEL_KEY[club.role]);

  const segments = SEGMENT_ORDER.map((segment) => ({
    label: t(SEGMENT_LABEL_KEY[segment]),
    clubs: invoice.clubs
      .filter((club) => club.segment === segment)
      .map((club) => ({
        productId: club.productId,
        club: club.name,
        role: role(club),
        sessions: String(club.paidCount),
        fee: money(club.feeCents),
        total: money(club.totalCents),
      })),
  })).filter(({ clubs }) => clubs.length > 0);

  // The club table's own order: segment, then the build's order within it.
  const clubsInTableOrder = SEGMENT_ORDER.flatMap((segment) =>
    invoice.clubs.filter((club) => club.segment === segment),
  );

  const sessionsByClub = clubsInTableOrder
    .map((club) => ({
      productId: club.productId,
      role: role(club),
      heading: `${club.name}${HEADING_SEPARATOR}${role(club)}`,
      sessions: club.lines
        .filter((line) => line.kind === "paid")
        .map((line) => ({
          date: pdfText(
            `${formatDateOnly(line.date, locale, { weekday: "short" })} ${formatDateOnly(line.date, locale, { day: "numeric", month: "numeric", year: "numeric" })}`,
          ),
          group: line.groupName,
        })),
    }))
    .filter(({ sessions }) => sessions.length > 0);

  const hasUpcoming = invoice.clubs.some((club) =>
    club.lines.some((line) => line.kind === "upcoming"),
  );

  return {
    title: t("export.statementTitle"),
    geduName: fullName(invoice),
    geduEmail: invoice.email,
    month: pdfText(
      formatDateOnly(monthStart, locale, { month: "long", year: "numeric" }),
    ),
    to: t("export.to"),
    figuresAsOf: pdfText(
      t("export.figuresAsOf", {
        // `Intl` refuses a zone name beside `dateStyle`/`timeStyle`, so the
        // fields are spelled out to carry the zone the time is read in.
        time: formatDate(now, locale, {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
          timeZone: DEFAULT_TIMEZONE,
        }),
      }),
    ),
    monthInProgress: hasUpcoming ? t("export.monthInProgress") : null,
    summaryHeading: t("export.summary"),
    summary: [
      {
        label: t("export.municipalityExclVat"),
        figure: money(invoice.municipalityTotalCents),
        isTotal: false,
      },
      {
        label: t("export.consumerExclVat"),
        figure: money(invoice.consumerTotalCents),
        isTotal: false,
      },
      {
        label: t("export.totalExclVat"),
        figure: money(invoice.totalCents),
        isTotal: true,
      },
    ],
    amountsNote: t("export.amountsExclVat"),
    clubsHeading: t("export.clubs"),
    clubColumns: {
      club: t("columnClub"),
      role: t("columnRole"),
      sessions: t("columnSessions"),
      fee: t("columnFee"),
      total: t("columnTotal"),
    },
    segments,
    sessionsHeading: t("export.sessionsToInvoice"),
    sessionColumns: {
      date: t("export.columnDate"),
      group: t("export.columnGroup"),
    },
    sessionsByClub,
    noSessions: t("export.noSessionsToInvoice"),
    pageLabel: (page, pages) => t("export.pageOf", { page, pages }),
  };
}

/** The statement as PDF bytes, rendered on the server. */
export async function renderGeduInvoicePdf(
  args: GeduInvoicePdfArgs,
): Promise<Buffer> {
  return renderToBuffer(
    <GeduInvoicePdfDocument content={geduInvoicePdfContent(args)} />,
  );
}

/**
 * Text with the narrow no-break space and the thin space that `Intl` puts in
 * some locales' figures — French amounts over a thousand, for one — turned
 * into an ordinary no-break space. A defensive normalisation: those two are
 * the characters a face is least likely to carry, the ordinary no-break space
 * is in every one, and they look the same at this size, so a figure prints
 * whatever the face.
 */
export function pdfText(value: string): string {
  return value.replace(/[\u202F\u2009]/g, "\u00A0");
}

const HEADING_SEPARATOR = " · ";

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

/**
 * The statement is set in the app face, from the same vendored files the Open
 * Graph cards draw with: full TTFs rather than a Latin subset, so a name in
 * any European alphabet prints, which the PDF standard fonts' encoding does
 * not promise. `next.config.ts` has to trace `src/assets/fonts/*.ttf` into any
 * route that renders it, as it does for the cards.
 */
const FONT_DIR = join(process.cwd(), "src", "assets", "fonts");
const FACE = FACES.sans.name;
Font.register({
  family: FACE,
  fonts: [
    { src: join(FONT_DIR, "poppins-regular.ttf"), fontWeight: 400 },
    { src: join(FONT_DIR, "poppins-semibold.ttf"), fontWeight: 600 },
  ],
});
// Hyphenating a club's name or a column header splits words nobody would
// split by hand; a line that does not fit wraps at a space instead.
Font.registerHyphenationCallback((word) => [word]);

const STRONG = 600;

// One ink on the white of the paper. Hierarchy is weight, size and rules — see
// `PRINT_INK` for why there is no grey.
const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: FACE,
    fontSize: 9.5,
    color: PRINT_INK,
    lineHeight: 1.4,
  },
  title: { fontWeight: STRONG, fontSize: 16 },
  month: { fontSize: 12, marginTop: 2 },
  headerBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  small: { fontSize: 8 },
  bold: { fontWeight: STRONG },
  notice: {
    marginTop: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: PRINT_INK,
    fontWeight: STRONG,
  },
  rule: {
    borderBottomWidth: 0.5,
    borderBottomColor: PRINT_INK,
    marginVertical: 14,
  },
  heading: { fontWeight: STRONG, fontSize: 11, marginBottom: 6 },
  sumRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: PRINT_INK,
    marginTop: 2,
    paddingTop: 4,
  },
  note: { fontSize: 8, marginTop: 6 },
  row: { flexDirection: "row", paddingVertical: 2 },
  headRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: PRINT_INK,
    paddingBottom: 3,
    marginBottom: 2,
    fontSize: 8,
    fontWeight: STRONG,
  },
  segmentLabel: {
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 6,
    marginBottom: 1,
  },
  colClub: { flex: 1, paddingRight: 6 },
  colRole: { width: "18%", paddingRight: 6 },
  colSessions: { width: "12%", textAlign: "right", paddingRight: 6 },
  colFee: { width: "15%", textAlign: "right", paddingRight: 6 },
  colTotal: { width: "15%", textAlign: "right" },
  clubSessions: { marginBottom: 8 },
  colDate: { width: "35%", paddingRight: 6 },
  colGroup: { flex: 1 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
  },
});

export function GeduInvoicePdfDocument({
  content,
}: {
  content: GeduInvoicePdfContent;
}) {
  return (
    <Document
      title={`${content.title} ${content.month}`}
      author={content.geduName}
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{content.title}</Text>
        <Text style={styles.month}>{content.month}</Text>

        <View style={styles.headerBlock}>
          <View>
            <Text style={styles.bold}>{content.geduName}</Text>
            <Text>{content.geduEmail}</Text>
          </View>
          <View>
            <Text>{content.to}</Text>
            <Text style={styles.small}>{content.figuresAsOf}</Text>
          </View>
        </View>

        {content.monthInProgress !== null && (
          <Text style={styles.notice}>{content.monthInProgress}</Text>
        )}

        <View style={styles.rule} />

        <Text style={styles.heading}>{content.summaryHeading}</Text>
        {content.summary.map((row) => (
          <View
            key={row.label}
            style={row.isTotal ? [styles.sumRow, styles.totalRow] : styles.sumRow}
          >
            <Text style={row.isTotal ? styles.bold : undefined}>{row.label}</Text>
            <Text style={row.isTotal ? styles.bold : undefined}>{row.figure}</Text>
          </View>
        ))}
        <Text style={styles.note}>{content.amountsNote}</Text>

        <View style={styles.rule} />

        <Text style={styles.heading}>{content.clubsHeading}</Text>
        <View style={styles.headRow}>
          <Text style={styles.colClub}>{content.clubColumns.club}</Text>
          <Text style={styles.colRole}>{content.clubColumns.role}</Text>
          <Text style={styles.colSessions}>{content.clubColumns.sessions}</Text>
          <Text style={styles.colFee}>{content.clubColumns.fee}</Text>
          <Text style={styles.colTotal}>{content.clubColumns.total}</Text>
        </View>
        {content.segments.map((segment) => (
          <View key={segment.label}>
            <Text style={styles.segmentLabel}>{segment.label}</Text>
            {segment.clubs.map((club) => (
              <View
                key={`${club.productId}|${club.role}`}
                style={styles.row}
                wrap={false}
              >
                <Text style={styles.colClub}>{club.club}</Text>
                <Text style={styles.colRole}>{club.role}</Text>
                <Text style={styles.colSessions}>{club.sessions}</Text>
                <Text style={styles.colFee}>{club.fee}</Text>
                <Text style={styles.colTotal}>{club.total}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.rule} />

        <Text style={styles.heading}>{content.sessionsHeading}</Text>
        {content.sessionsByClub.length === 0 ? (
          <Text>{content.noSessions}</Text>
        ) : (
          content.sessionsByClub.map((club) => (
            <View key={`${club.productId}|${club.role}`} style={styles.clubSessions}>
              <Text style={styles.bold}>{club.heading}</Text>
              <View style={styles.headRow}>
                <Text style={styles.colDate}>{content.sessionColumns.date}</Text>
                <Text style={styles.colGroup}>{content.sessionColumns.group}</Text>
              </View>
              {club.sessions.map((session) => (
                <View
                  key={`${session.date}|${session.group}`}
                  style={styles.row}
                  wrap={false}
                >
                  <Text style={styles.colDate}>{session.date}</Text>
                  <Text style={styles.colGroup}>{session.group}</Text>
                </View>
              ))}
            </View>
          ))
        )}

        <View style={styles.footer} fixed>
          <Text>
            {content.geduName}
            {HEADING_SEPARATOR}
            {content.month}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              content.pageLabel(pageNumber, totalPages)
            }
          />
        </View>
      </Page>
    </Document>
  );
}
