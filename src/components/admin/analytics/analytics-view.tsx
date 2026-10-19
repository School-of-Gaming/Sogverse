"use client";

import { useState, useTransition, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Link, useRouter } from "@/i18n/navigation";
import { LOCALE_CONFIG, formattingLocale, resolveLocale } from "@/lib/constants/locales";
import { ROUTES } from "@/lib/constants";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import { cn, formatDate, formatDateOnly } from "@/lib/utils";
import { useTimezone } from "@/providers";
import {
  ANALYTICS_PRESETS,
  type AnalyticsRange,
  type AnalyticsResult,
  type BreakdownRow,
  type CampaignLabelCount,
  type CampaignRow,
  type LandingPageRow,
  type PathLanguage,
  type RouteRow,
} from "@/services/admin-analytics/admin-analytics.build";

/**
 * The admin analytics page's presentational half. Everything here takes
 * figures already read and reduced on the server; nothing reads anything.
 */

/** A count in the reader's locale. */
function useCount(): (value: number) => string {
  const locale = useLocale();
  const format = new Intl.NumberFormat(formattingLocale(locale));
  return (value) => format.format(value);
}

// ---------------------------------------------------------------------------
// The page's frame
// ---------------------------------------------------------------------------

/** The title, the range picker and the sections beneath — nothing in it waits on a read. */
export function AnalyticsShell({
  range,
  earliest,
  today,
  children,
}: {
  range: AnalyticsRange;
  earliest: string;
  today: string;
  children: ReactNode;
}) {
  const t = useTranslations("admin.analytics");
  return (
    <div className="space-y-8 pb-12">
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {/* Keyed by the range so its date inputs reseed from the address after a
            preset link or the back button, rather than keeping the old dates. */}
        <RangePicker
          key={`${range.from}..${range.to}`}
          range={range}
          earliest={earliest}
          today={today}
        />
      </div>
      {children}
    </div>
  );
}

function pillClass(active: boolean): string {
  return cn(
    "inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors",
    active ? "bg-lifted text-foreground" : "text-muted-foreground hover:bg-hover hover:text-foreground",
  );
}

/**
 * The quick ranges as links, and a custom range as two dates and a button. The
 * range lives in the address, so a range can be shared and the back button
 * steps through them; picking one re-renders the page on the server.
 */
function RangePicker({
  range,
  earliest,
  today,
}: {
  range: AnalyticsRange;
  earliest: string;
  today: string;
}) {
  const t = useTranslations("admin.analytics.range");
  const locale = useLocale();
  const router = useRouter();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [pending, startTransition] = useTransition();

  const apply = () => {
    startTransition(() => {
      router.push({ pathname: ROUTES.admin.analytics, query: { from, to } });
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div role="group" aria-label={t("label")} className="flex flex-wrap items-center gap-1.5">
        {ANALYTICS_PRESETS.map((days) => (
          <Link
            key={days}
            href={{ pathname: ROUTES.admin.analytics, query: { range: String(days) } }}
            aria-current={range.preset === days ? "page" : undefined}
            className={pillClass(range.preset === days)}
          >
            {t("preset", { days })}
          </Link>
        ))}
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">{t("from")}</span>
          <DatePicker
            id="analytics-from"
            value={from}
            onChange={setFrom}
            today={today}
            weekPick={{ edge: "start", weekdays: [] }}
            rangeEnd={to}
            disabled={pending}
            className="w-48"
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">{t("to")}</span>
          <DatePicker
            id="analytics-to"
            value={to}
            onChange={setTo}
            today={today}
            weekPick={{ edge: "end", weekdays: [] }}
            rangeStart={from}
            disabled={pending}
            className="w-48"
          />
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={pending || from === "" || to === ""}>
          {t("apply")}
        </Button>
      </form>
      <p className="w-full text-xs text-muted-foreground">
        {t("showing", {
          from: formatDateOnly(range.from, locale),
          to: formatDateOnly(range.to, locale),
        })}{" "}
        {t("dataStarts", { date: formatDateOnly(earliest, locale) })}
      </p>
    </div>
  );
}

/** A section's heading, what its figures are, and when they were read. */
export function AnalyticsSection({
  heading,
  caption,
  children,
}: {
  heading: string;
  caption?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{heading}</h2>
        {caption && <p className="max-w-3xl text-xs text-muted-foreground">{caption}</p>}
      </div>
      {children}
    </section>
  );
}

/** When a Vercel read was made, in the reader's zone, and that it is kept for the hour. */
export function ReadAt({ readAt }: { readAt: string }) {
  const t = useTranslations("admin.analytics");
  const locale = useLocale();
  const timeZone = useTimezone();
  const time = formatDate(readAt, locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  });
  return <p className="text-xs text-muted-foreground">{t("readAt", { time })}</p>;
}

/**
 * Why a section has no figures. Never zeros: "nothing happened" and "nothing
 * could be read" must not look alike.
 */
export function AnalyticsFailure({
  reason,
}: {
  reason: Extract<AnalyticsResult<unknown>, { ok: false }>["reason"];
}) {
  const t = useTranslations("admin.analytics.errors");
  return (
    <Alert variant="destructive">
      <AlertDescription>{t(reason)}</AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// The three measures
// ---------------------------------------------------------------------------

/** One measure: its figure, what else it says, and what it counts. */
export function MeasureCard({
  title,
  figure,
  detail,
  caption,
  footer,
}: {
  title: string;
  figure: number | null;
  detail?: string;
  caption: string;
  footer?: ReactNode;
}) {
  const count = useCount();
  return (
    <Card className="flex h-full flex-col gap-2 p-5">
      <p className="text-sm font-semibold">{title}</p>
      <p className="flex min-h-10 items-end gap-2">
        {figure !== null && (
          <span className="text-4xl font-semibold leading-none tabular-nums">{count(figure)}</span>
        )}
        {detail && <span className="text-sm text-muted-foreground">{detail}</span>}
      </p>
      <p className="text-xs text-muted-foreground">{caption}</p>
      {footer && <div className="mt-auto space-y-1 pt-1">{footer}</div>}
    </Card>
  );
}

/** A measure that could not be read: its title and what it counts stay, the figure is the failure. */
export function MeasureFailure({
  title,
  caption,
  reason,
}: {
  title: string;
  caption: string;
  reason: Extract<AnalyticsResult<unknown>, { ok: false }>["reason"];
}) {
  return (
    <Card className="flex h-full flex-col gap-2 p-5">
      <p className="text-sm font-semibold">{title}</p>
      <AnalyticsFailure reason={reason} />
      <p className="text-xs text-muted-foreground">{caption}</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** How many rows a long table shows before "Show all". */
const COLLAPSED_ROWS = 15;

/** A language's name as the locale picker writes it, or "no language" for an unprefixed path. */
function useLanguageName(): (language: PathLanguage) => string {
  const t = useTranslations("admin.analytics");
  return (language) => (language === "none" ? t("noLanguage") : LOCALE_CONFIG[language].nativeLabel);
}

/** A row's languages on one quiet line: "Suomi 120 · English 30". */
function LanguageLine({ languages }: { languages: { language: PathLanguage; pageviews: number }[] }) {
  const t = useTranslations("admin.analytics");
  const count = useCount();
  const name = useLanguageName();
  if (languages.length === 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {languages
        .map(({ language, pageviews }) =>
          t("languageCount", { language: name(language), count: count(pageviews) }),
        )
        .join(SCHEDULE_PART_SEPARATOR)}
    </p>
  );
}

/** The "Show all" control under a long table. */
function ShowAll({
  total,
  expanded,
  onToggle,
}: {
  total: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("admin.analytics");
  if (total <= COLLAPSED_ROWS) return null;
  return (
    <div className="border-t border-border px-4 py-2">
      <Button type="button" variant="ghost" size="sm" onClick={onToggle}>
        {expanded ? t("showFewer") : t("showAll", { count: total })}
      </Button>
    </div>
  );
}

/** A header row over a table of figures: the label column and the number columns. */
function TableHead({ columns }: { columns: string[] }) {
  const [first, ...numbers] = columns;
  return (
    <thead>
      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
        <th scope="col" className="px-4 py-2 font-medium">
          {first}
        </th>
        {numbers.map((column) => (
          <th key={column} scope="col" className="w-28 px-4 py-2 text-right font-medium">
            {column}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function LandingPagesTable({ rows }: { rows: LandingPageRow[] }) {
  const t = useTranslations("admin.analytics.landing");
  const locale = resolveLocale(useLocale());
  const count = useCount();
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <TableHead columns={[t("columns.page"), t("columns.pageviews")]} />
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const title = row.page ? resolveTranslation(row.page.versions, locale)?.title : null;
            return (
              <tr key={row.page?.id ?? row.path}>
                <td className="space-y-0.5 px-4 py-2.5">
                  {row.page ? (
                    <Link
                      href={ROUTES.admin.landingPage(row.page.id)}
                      className="font-medium hover:underline"
                    >
                      {title ?? row.page.id}
                    </Link>
                  ) : (
                    <>
                      <p className="break-all font-mono text-xs">{row.path}</p>
                      <p className="text-xs text-muted-foreground">{t("unmatched")}</p>
                    </>
                  )}
                  <LanguageLine languages={row.languages} />
                </td>
                <td className="px-4 py-2.5 text-right align-top tabular-nums">{count(row.pageviews)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

export function TopPagesTable({ rows }: { rows: RouteRow[] }) {
  const t = useTranslations("admin.analytics.pages");
  const count = useCount();
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  const shown = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <TableHead columns={[t("columns.page"), t("columns.pageviews")]} />
        <tbody className="divide-y divide-border">
          {shown.map((row) => (
            <tr key={row.route}>
              <td className="px-4 py-2.5">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5">
                    <ChevronRight
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                      aria-hidden
                    />
                    <span className="break-all font-mono text-xs">{row.route}</span>
                  </summary>
                  <div className="pt-1 pl-5">
                    {row.languages.length > 0 ? (
                      <LanguageLine languages={row.languages} />
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("noSplit")}</p>
                    )}
                  </div>
                </details>
              </td>
              <td className="px-4 py-2.5 text-right align-top tabular-nums">{count(row.pageviews)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ShowAll total={rows.length} expanded={expanded} onToggle={() => setExpanded(!expanded)} />
    </Card>
  );
}

/** A campaign's sources or mediums on one line, the empty one named. */
function LabelList({ labels }: { labels: CampaignLabelCount[] }) {
  const t = useTranslations("admin.analytics.campaigns");
  return (
    <span className="text-xs text-muted-foreground">
      {labels.map((label) => label.value ?? t("noValue")).join(", ")}
    </span>
  );
}

export function CampaignsTable({ rows }: { rows: CampaignRow[] }) {
  const t = useTranslations("admin.analytics.campaigns");
  const count = useCount();
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  const shown = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-4 py-2 font-medium">
              {t("columns.campaign")}
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              {t("columns.sources")}
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              {t("columns.mediums")}
            </th>
            <th scope="col" className="w-28 px-4 py-2 text-right font-medium">
              {t("columns.pageviews")}
            </th>
            <th scope="col" className="w-28 px-4 py-2 text-right font-medium">
              {t("columns.signups")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {shown.map((row) => (
            <tr key={row.campaign ?? ""}>
              <td className="px-4 py-2.5">
                {row.campaign === null ? (
                  <span className="space-y-0.5">
                    <span className="block font-medium">{t("none")}</span>
                    <span className="block text-xs text-muted-foreground">{t("noneHint")}</span>
                  </span>
                ) : (
                  <span className="break-all font-medium">{row.campaign}</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <LabelList labels={row.sources} />
              </td>
              <td className="px-4 py-2.5">
                <LabelList labels={row.mediums} />
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{count(row.pageviews)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{count(row.signups)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ShowAll total={rows.length} expanded={expanded} onToggle={() => setExpanded(!expanded)} />
    </Card>
  );
}

/** How many values a breakdown lists before folding the rest into "everything else". */
const BREAKDOWN_ROWS = 8;

/** One breakdown as a short ranked list with each value's share of the views. */
export function BreakdownList({
  title,
  rows,
  name,
}: {
  title: string;
  rows: BreakdownRow[];
  /** The value as a reader names it; `null` is the empty value. */
  name: (value: string | null) => string;
}) {
  const t = useTranslations("admin.analytics.breakdowns");
  const count = useCount();
  const locale = useLocale();
  const total = rows.reduce((sum, row) => sum + row.pageviews, 0);
  const share = new Intl.NumberFormat(formattingLocale(locale), {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const top = rows.slice(0, BREAKDOWN_ROWS);
  const rest = rows.slice(BREAKDOWN_ROWS).reduce((sum, row) => sum + row.pageviews, 0);
  const lines = [
    ...top.map((row) => ({ key: JSON.stringify(row.value), label: name(row.value), pageviews: row.pageviews })),
    ...(rest > 0 ? [{ key: "rest", label: t("rest", { count: rows.length - BREAKDOWN_ROWS }), pageviews: rest }] : []),
  ];
  return (
    <Card className="p-4">
      <h3 className="pb-2 text-sm font-semibold">{title}</h3>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {lines.map((line) => (
            <li key={line.key} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
              <span className="min-w-0 break-words">{line.label}</span>
              <span className="shrink-0 tabular-nums">
                {count(line.pageviews)}
                <span className="ml-2 inline-block w-10 text-right text-xs text-muted-foreground">
                  {share.format(total === 0 ? 0 : line.pageviews / total)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The three breakdowns, each naming its own empty value. */
export function Breakdowns({
  referrers,
  countries,
  devices,
}: {
  referrers: BreakdownRow[];
  countries: BreakdownRow[];
  devices: BreakdownRow[];
}) {
  const t = useTranslations("admin.analytics.breakdowns");
  const locale = useLocale();
  const regions = new Intl.DisplayNames([formattingLocale(locale)], { type: "region" });
  const country = (code: string | null) => {
    if (code === null) return t("unknown");
    try {
      return regions.of(code) ?? code;
    } catch {
      // Not a region code Intl knows: show it as Vercel reported it.
      return code;
    }
  };
  const device = (value: string | null) => {
    if (value === "desktop" || value === "mobile" || value === "tablet") return t(`deviceTypes.${value}`);
    return value ?? t("unknown");
  };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <BreakdownList title={t("referrers")} rows={referrers} name={(value) => value ?? t("noReferrer")} />
      <BreakdownList title={t("countries")} rows={countries} name={country} />
      <BreakdownList title={t("devices")} rows={devices} name={device} />
    </div>
  );
}
