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
import { BRAND, PRINT_INK, PRINT_STATUS_EDGE } from "@/lib/constants/colors";
import {
  DEFAULT_TIMEZONE,
  type SupportedLocale,
} from "@/lib/constants/locales";
import {
  formatCurrencyFromCents,
  formatDate,
  formatDateOnly,
} from "@/lib/utils";
import {
  fullName,
  type GeduInvoice,
  type GeduInvoiceClub,
  type GeduInvoiceLine,
  type GeduInvoiceLineKind,
} from "./build-gedu-invoicing";
import type { GeduInvoicingTranslator } from "./gedu-invoice-export";
import { SogPdfMark } from "./gedu-invoice-pdf-mark";
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
 * Helsinki time, on every page.
 *
 * **It says whether the month is complete.** Right under the sums it states
 * either that nothing in the month is still open, or exactly what is: each
 * past session with nothing recorded, by date, club and group, and how many
 * are still upcoming. Whoever reads it in an accounting inbox can tell a
 * finished month from a partial one without reading the detail.
 *
 * It leads with the two sums the Gedu handbook asks gedus to itemise, then the
 * club lines they come from, then **every dated line of the month** — paid,
 * not recorded, upcoming, cancelled and away — each with its amount, so the
 * detail is the page's dates on paper and a line that pays nothing says why.
 * A line that does not pay is at zero; a club whose fee is unset shows a
 * neutral dash in place of every amount, as the CSV leaves its cells blank,
 * because an unset fee is never zero and the gedu page says nothing more
 * about it.
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

export interface GeduInvoicePdfSession {
  date: string;
  group: string;
  /** The page's outcome for the line: "Recorded", "Away — … substituted". */
  status: string;
  /** What else the line needs said: who it covered for, why it is open. */
  details: readonly string[];
  amount: string;
  pays: boolean;
}

export interface GeduInvoicePdfContent {
  title: string;
  geduName: string;
  geduEmail: string;
  month: string;
  to: string;
  figuresAsOf: string;
  /** Whether anything in the month is still open, and exactly what. */
  completeness: {
    isComplete: boolean;
    title: string;
    /** The sentence a complete month carries; null on an incomplete one. */
    body: string | null;
    /** Past sessions with nothing recorded, one line each, by date. */
    unrecorded: { text: string; sessions: readonly string[] } | null;
    /** How many sessions are still ahead, as a sentence. */
    upcoming: string | null;
  };
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
  sessionColumns: {
    date: string;
    group: string;
    status: string;
    amount: string;
  };
  /** Every club line, in the club table's order, with every dated line. */
  sessionsByClub: readonly {
    productId: string;
    role: string;
    heading: string;
    /** "Fee / session €65.00", beside the heading. */
    fee: string;
    sessions: readonly GeduInvoicePdfSession[];
    total: { label: string; sessions: string; amount: string };
  }[];
  /** Shown in place of the session detail when the month has no line. */
  noSessions: string;
  /** The footer's left half, on every page. */
  footer: string;
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
  const role = (club: GeduInvoiceClub) => t(ROLE_LABEL_KEY[club.role]);
  const sessionDate = (date: string) =>
    pdfText(
      `${formatDateOnly(date, locale, { weekday: "short" })} ${formatDateOnly(date, locale, { day: "numeric", month: "numeric", year: "numeric" })}`,
    );

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

  const sessionStatus = (line: GeduInvoiceLine) =>
    line.kind === "absent"
      ? line.substitute === null
        ? t("absentNoSubstitute")
        : t("absentSubstituted", { name: fullName(line.substitute) })
      : t(STATUS_KEY[line.kind]);

  const sessionDetails = (line: GeduInvoiceLine) => [
    ...(line.coveringFor === null
      ? []
      : [t("export.coveringFor", { name: fullName(line.coveringFor) })]),
    ...(line.kind === "unrecorded" ? [t("export.notRecordedDetail")] : []),
  ];

  const sessionsByClub = clubsInTableOrder
    .filter((club) => club.lines.length > 0)
    .map((club) => ({
      productId: club.productId,
      role: role(club),
      heading: `${club.name}${HEADING_SEPARATOR}${role(club)}`,
      fee: `${t("columnFee")} ${money(club.feeCents)}`,
      sessions: club.lines.map((line) => ({
        date: sessionDate(line.date),
        group: line.groupName,
        status: sessionStatus(line),
        details: sessionDetails(line),
        // Mirrors the CSV: zero where the line pays nothing, a dash on every
        // line of a club whose fee is unset.
        amount:
          club.feeCents === null
            ? NO_FIGURE
            : money(line.kind === "paid" ? club.feeCents : 0),
        pays: line.kind === "paid",
      })),
      total: {
        label: t("columnTotal"),
        sessions: t("sessionCount", { count: club.paidCount }),
        amount: money(club.totalCents),
      },
    }));

  const unrecorded = clubsInTableOrder
    .flatMap((club) =>
      club.lines
        .filter((line) => line.kind === "unrecorded")
        .map((line) => ({ club, line })),
    )
    .sort(
      (a, b) =>
        a.line.date.localeCompare(b.line.date) ||
        a.club.name.localeCompare(b.club.name, locale) ||
        a.line.groupName.localeCompare(b.line.groupName, locale),
    );
  const upcomingCount = invoice.clubs.reduce(
    (count, club) =>
      count + club.lines.filter((line) => line.kind === "upcoming").length,
    0,
  );
  const isComplete = unrecorded.length === 0 && upcomingCount === 0;

  const figuresAsOf = pdfText(
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
  );
  const month = pdfText(
    formatDateOnly(monthStart, locale, { month: "long", year: "numeric" }),
  );
  const geduName = fullName(invoice);

  return {
    title: t("export.statementTitle"),
    geduName,
    geduEmail: invoice.email,
    month,
    to: t("export.to"),
    figuresAsOf,
    completeness: {
      isComplete,
      title: isComplete
        ? t("export.completeTitle")
        : t("export.incompleteTitle"),
      body: isComplete ? t("export.completeBody") : null,
      unrecorded:
        unrecorded.length === 0
          ? null
          : {
              text: t("export.incompleteUnrecorded", {
                count: unrecorded.length,
              }),
              sessions: unrecorded.map(({ club, line }) =>
                [sessionDate(line.date), club.name, line.groupName].join(
                  HEADING_SEPARATOR,
                ),
              ),
            },
      upcoming:
        upcomingCount === 0
          ? null
          : t("export.incompleteUpcoming", { count: upcomingCount }),
    },
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
    sessionsHeading: t("export.sessions"),
    sessionColumns: {
      date: t("export.columnDate"),
      group: t("export.columnGroup"),
      status: t("export.columnStatus"),
      amount: t("export.columnAmountExclVat"),
    },
    sessionsByClub,
    noSessions: t("export.noSessions"),
    footer: t("export.footer", { name: geduName, month }),
    pageLabel: (page, pages) => t("export.pageOf", { page, pages }),
  };
}

/** The page's outcome word for every kind but away, which names a person. */
const STATUS_KEY = {
  paid: "recorded",
  unrecorded: "notRecorded",
  upcoming: "upcoming",
  cancelled: "cancelled",
} as const satisfies Record<Exclude<GeduInvoiceLineKind, "absent">, string>;

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
  return value.replace(/[  ]/g, " ");
}

const HEADING_SEPARATOR = " · ";
/** Punctuation, like `NO_FIGURE`: a list mark reads the same in every locale. */
const BULLET = "•";

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
const MARGIN = 44;
/** A hairline between table rows: thin enough to read as a rule, not a box. */
const HAIRLINE = 0.3;

/**
 * School of Gaming's paper: the brand's ink on white, with act — the colour
 * the badge is — as the one accent, at its authored value on the band under
 * the letterhead, the heading marks and the total, and carrying its own ink
 * where it is a fill. No second brand colour: the statement goes to an
 * accounting inbox, where a calm page is the credible one. A grey would be a
 * colour the library does not have on white, so hierarchy is weight, size and
 * hairline rules; the completeness panel's edge is the one status colour.
 */
const styles = StyleSheet.create({
  page: {
    paddingTop: MARGIN,
    paddingBottom: 72,
    paddingHorizontal: MARGIN,
    fontFamily: FACE,
    fontSize: 9,
    color: PRINT_INK,
    lineHeight: 1.4,
  },
  letterhead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  letterheadTitle: { alignItems: "flex-end" },
  title: { fontWeight: STRONG, fontSize: 20, lineHeight: 1.1 },
  month: { fontSize: 12, marginTop: 2 },
  band: { height: 4, backgroundColor: BRAND.act, marginTop: 14 },
  parties: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  partyRight: { alignItems: "flex-end" },
  small: { fontSize: 8 },
  bold: { fontWeight: STRONG },
  section: { marginTop: 22 },
  headingRow: { marginBottom: 8 },
  heading: { fontWeight: STRONG, fontSize: 12 },
  headingMark: {
    width: 24,
    height: 2.5,
    backgroundColor: BRAND.act,
    marginTop: 3,
  },
  sumRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: HAIRLINE,
    borderBottomColor: PRINT_INK,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    paddingHorizontal: 8,
    marginTop: 4,
    backgroundColor: BRAND.act,
    color: BRAND.actForeground,
    fontWeight: STRONG,
    fontSize: 11,
  },
  note: { fontSize: 8, marginTop: 5 },
  panel: {
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderLeftWidth: 5,
  },
  panelComplete: { borderColor: PRINT_STATUS_EDGE.success },
  panelIncomplete: { borderColor: PRINT_STATUS_EDGE.warning },
  panelTitle: { fontWeight: STRONG, fontSize: 10.5, marginBottom: 2 },
  panelParagraph: { marginTop: 4 },
  panelList: { marginTop: 3, paddingLeft: 10 },
  bulletRow: { flexDirection: "row" },
  bullet: { width: 9 },
  bulletText: { flex: 1 },
  headRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: PRINT_INK,
    paddingBottom: 3,
    fontSize: 7.5,
    fontWeight: STRONG,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: HAIRLINE,
    borderBottomColor: PRINT_INK,
  },
  segmentLabel: {
    fontSize: 7.5,
    fontWeight: STRONG,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 8,
    paddingBottom: 2,
  },
  colClub: { flex: 1, paddingRight: 6 },
  colRole: { width: "16%", paddingRight: 6 },
  colSessions: { width: "12%", textAlign: "right", paddingRight: 6 },
  colFee: { width: "16%", textAlign: "right", paddingRight: 6 },
  colTotal: { width: "15%", textAlign: "right" },
  clubBlock: { marginBottom: 16 },
  clubHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 4,
  },
  clubName: { fontWeight: STRONG, fontSize: 10, flex: 1, paddingRight: 8 },
  colDate: { width: "19%", paddingRight: 6 },
  colGroup: { width: "22%", paddingRight: 6 },
  colStatus: { flex: 1, paddingRight: 6 },
  colAmount: { width: "16%", textAlign: "right" },
  detail: { fontSize: 7.5 },
  clubTotal: {
    flexDirection: "row",
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: PRINT_INK,
    fontWeight: STRONG,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: MARGIN,
    right: MARGIN,
    paddingTop: 6,
    borderTopWidth: 1.5,
    borderTopColor: BRAND.act,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    // Not inherited from the page: react-pdf 4.9 re-resolves a dynamic text's
    // already-resolved line height as a multiplier when it lays the page
    // numbers out, so an inherited 1.4 becomes a line taller than the footer
    // and the whole footer silently drops. The empty value stops the
    // inheritance and leaves the face's own leading.
    lineHeight: "",
  },
});

/**
 * Room a heading needs below it before it may start a page: a heading at the
 * foot of a page with its first row on the next is the orphan this prevents.
 */
const HEADING_PRESENCE = 72;

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
        <View style={styles.footer} fixed>
          <Text>{content.footer}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${content.figuresAsOf}${HEADING_SEPARATOR}${content.pageLabel(pageNumber, totalPages)}`
            }
          />
        </View>

        <View style={styles.letterhead}>
          <SogPdfMark height={46} />
          <View style={styles.letterheadTitle}>
            <Text style={styles.title}>{content.title}</Text>
            <Text style={styles.month}>{content.month}</Text>
          </View>
        </View>
        <View style={styles.band} />

        <View style={styles.parties}>
          <View>
            <Text style={styles.bold}>{content.geduName}</Text>
            <Text>{content.geduEmail}</Text>
          </View>
          <View style={styles.partyRight}>
            <Text style={styles.bold}>{content.to}</Text>
            <Text style={styles.small}>{content.figuresAsOf}</Text>
          </View>
        </View>

        <View style={styles.section} wrap={false}>
          <Heading text={content.summaryHeading} />
          {content.summary.map((row) =>
            row.isTotal ? (
              <View key={row.label} style={styles.totalRow}>
                <Text>{row.label}</Text>
                <Text>{row.figure}</Text>
              </View>
            ) : (
              <View key={row.label} style={styles.sumRow}>
                <Text>{row.label}</Text>
                <Text>{row.figure}</Text>
              </View>
            ),
          )}
          <Text style={styles.note}>{content.amountsNote}</Text>
        </View>

        <Completeness completeness={content.completeness} />

        {content.segments.length > 0 && (
          <View style={styles.section}>
            <Heading text={content.clubsHeading} />
            <View style={styles.headRow}>
              <Text style={styles.colClub}>{content.clubColumns.club}</Text>
              <Text style={styles.colRole}>{content.clubColumns.role}</Text>
              <Text style={styles.colSessions}>
                {content.clubColumns.sessions}
              </Text>
              <Text style={styles.colFee}>{content.clubColumns.fee}</Text>
              <Text style={styles.colTotal}>{content.clubColumns.total}</Text>
            </View>
            {content.segments.map((segment) => {
              // Never empty: a segment with no club is left out of `segments`.
              const [first, ...rest] = segment.clubs;
              return (
                <View key={segment.label}>
                  {/* A segment's label never ends a page without its first club. */}
                  <View wrap={false}>
                    <Text style={styles.segmentLabel}>{segment.label}</Text>
                    <ClubRow club={first} />
                  </View>
                  {rest.map((club) => (
                    <ClubRow
                      key={`${club.productId}|${club.role}`}
                      club={club}
                    />
                  ))}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.section}>
          <Heading text={content.sessionsHeading} />
          {content.sessionsByClub.length === 0 ? (
            <Text>{content.noSessions}</Text>
          ) : (
            content.sessionsByClub.map((club) => (
              <ClubSessions
                key={`${club.productId}|${club.role}`}
                club={club}
                columns={content.sessionColumns}
              />
            ))
          )}
        </View>
      </Page>
    </Document>
  );
}

function ClubRow({
  club,
}: {
  club: GeduInvoicePdfContent["segments"][number]["clubs"][number];
}) {
  return (
    <View style={styles.row} wrap={false}>
      <Text style={styles.colClub}>{club.club}</Text>
      <Text style={styles.colRole}>{club.role}</Text>
      <Text style={styles.colSessions}>{club.sessions}</Text>
      <Text style={styles.colFee}>{club.fee}</Text>
      <Text style={styles.colTotal}>{club.total}</Text>
    </View>
  );
}

function Heading({ text }: { text: string }) {
  return (
    <View style={styles.headingRow} minPresenceAhead={HEADING_PRESENCE}>
      <Text style={styles.heading}>{text}</Text>
      <View style={styles.headingMark} />
    </View>
  );
}

function Completeness({
  completeness,
}: {
  completeness: GeduInvoicePdfContent["completeness"];
}) {
  return (
    <View
      style={[
        styles.panel,
        completeness.isComplete ? styles.panelComplete : styles.panelIncomplete,
      ]}
    >
      <Text style={styles.panelTitle}>{completeness.title}</Text>
      {completeness.body !== null && <Text>{completeness.body}</Text>}
      {completeness.unrecorded !== null && (
        <View style={styles.panelParagraph}>
          <Text>{completeness.unrecorded.text}</Text>
          <View style={styles.panelList}>
            {completeness.unrecorded.sessions.map((session) => (
              <View key={session} style={styles.bulletRow} wrap={false}>
                <Text style={styles.bullet}>{BULLET}</Text>
                <Text style={styles.bulletText}>{session}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      {completeness.upcoming !== null && (
        <Text style={styles.panelParagraph}>{completeness.upcoming}</Text>
      )}
    </View>
  );
}

function ClubSessions({
  club,
  columns,
}: {
  club: GeduInvoicePdfContent["sessionsByClub"][number];
  columns: GeduInvoicePdfContent["sessionColumns"];
}) {
  // Never empty: a club line with no dated line is left out of the detail.
  const [first, ...rest] = club.sessions;
  const last = rest.pop();
  const total = (
    <View style={styles.clubTotal}>
      <Text style={styles.colDate}>{club.total.label}</Text>
      <Text style={styles.colGroup}>{club.total.sessions}</Text>
      <Text style={styles.colStatus} />
      <Text style={styles.colAmount}>{club.total.amount}</Text>
    </View>
  );

  // Nothing is left alone at a page edge: the heading travels with the column
  // header and the first row, and the total with the last row. Every row in
  // between is whole on one page or the next. The column header is not
  // repeated on a continuation page: react-pdf 4.9 places a repeating header
  // at the foot of the page it would orphan on, whatever room is asked for.
  return (
    <View style={styles.clubBlock}>
      <View wrap={false}>
        <View style={styles.clubHeading}>
          <Text style={styles.clubName}>{club.heading}</Text>
          <Text style={styles.small}>{club.fee}</Text>
        </View>
        <View style={styles.headRow}>
          <Text style={styles.colDate}>{columns.date}</Text>
          <Text style={styles.colGroup}>{columns.group}</Text>
          <Text style={styles.colStatus}>{columns.status}</Text>
          <Text style={styles.colAmount}>{columns.amount}</Text>
        </View>
        <SessionRow session={first} />
        {last === undefined && total}
      </View>
      {rest.map((session) => (
        <SessionRow
          key={`${session.date}|${session.group}`}
          session={session}
        />
      ))}
      {last !== undefined && (
        <View wrap={false}>
          <SessionRow session={last} />
          {total}
        </View>
      )}
    </View>
  );
}

function SessionRow({ session }: { session: GeduInvoicePdfSession }) {
  return (
    <View style={styles.row} wrap={false}>
      <Text style={styles.colDate}>{session.date}</Text>
      <Text style={styles.colGroup}>{session.group}</Text>
      <View style={styles.colStatus}>
        <Text style={session.pays ? styles.bold : undefined}>
          {session.status}
        </Text>
        {session.details.map((detail) => (
          <Text key={detail} style={styles.detail}>
            {detail}
          </Text>
        ))}
      </View>
      <Text style={styles.colAmount}>{session.amount}</Text>
    </View>
  );
}
