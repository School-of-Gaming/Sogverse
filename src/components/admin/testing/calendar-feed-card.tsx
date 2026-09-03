"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn, findOption, formatDate, formatTimeRange } from "@/lib/utils";
import {
  ALARM_VALUES,
  BUSY_VALUES,
  CALENDAR_FEED_DEFAULTS,
  CALNAME_MAX_LENGTH,
  COLOR_VALUES,
  DETAILS_VALUES,
  MODE_VALUES,
  REFRESH_VALUES,
  TITLE_VALUES,
  TZ_VALUES,
  WEEKS_VALUES,
  calendarFeedQuery,
  type CalendarFeedOptions,
} from "@/lib/calendar-feed/options";
import {
  useCalendarFeedLookup,
  useCalendarFeedPreview,
  type CalendarFeedLookupResponse,
  type CalendarFeedPreviewEvent,
} from "@/services/calendar-feed";

/**
 * The calendar-feed exploration's cockpit: resolve a family, turn every knob,
 * and get the two URLs a real calendar app takes.
 *
 * It exists because the interesting question here is not answerable in code —
 * what Apple, Google and Outlook each *do* with a `VALARM`, an `RRULE` or a
 * `TZID` can only be found out by subscribing three clients to three URLs and
 * looking. So the card's whole job is to make producing those URLs, and seeing
 * what is in them before you send one anywhere, a matter of seconds.
 */

// Copied rather than imported from the page: the page is one consumer of this
// pattern and this card is another, and reaching across for a constant would
// make one of them the other's dependency for a class string.
const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Roughly four rows of table, so the skeleton and the first result agree. */
const PREVIEW_MIN_HEIGHT = "min-h-40";

/** How long the Copy button says "Copied" before returning to "Copy". */
const COPIED_MS = 1500;

interface FeedUrls {
  https: string;
  webcal: string;
  json: string;
}

function buildFeedUrls(
  origin: string,
  token: string,
  options: CalendarFeedOptions,
): FeedUrls {
  const query = calendarFeedQuery(options);
  // The `.ics` suffix is optional on the route and carried here because some
  // clients want a URL that ends in a file name; the token verifier strips it.
  const path = `/api/calendar/feed/${token}.ics${query === "" ? "" : `?${query}`}`;
  return {
    https: `${origin}${path}`,
    // Same path, same token, different scheme — `webcal:` is what makes a
    // desktop client offer to subscribe instead of downloading a file once.
    webcal: `${origin.replace(/^https?:/, "webcal:")}${path}`,
    json: `${origin}${path}${query === "" ? "?" : "&"}format=json`,
  };
}

/** A copy button whose width does not change when its label does. */
function CopyButton({ value }: { value: string }) {
  const t = useTranslations("admin.testing.calendarFeed");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        // A clipboard write can be refused (an insecure origin, a denied
        // permission); the refusal simply leaves the label alone.
        void navigator.clipboard.writeText(value).then(
          () => setCopied(true),
          () => undefined,
        );
      }}
    >
      {/* Both labels occupy one grid cell, so the button is always as wide as
          the longer of them and confirming a copy never nudges the input beside
          it. */}
      <span className="grid">
        <span className={cn("col-start-1 row-start-1", copied && "invisible")}>
          {t("copy")}
        </span>
        <span className={cn("col-start-1 row-start-1", !copied && "invisible")}>
          {t("copied")}
        </span>
      </span>
    </Button>
  );
}

function UrlRow({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value: string;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        <Input id={id} readOnly value={value} className="font-mono text-xs" />
        <CopyButton value={value} />
      </div>
    </Field>
  );
}

function PreviewSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="h-6 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}

function PreviewTable({
  events,
  locale,
  timeZone,
}: {
  events: readonly CalendarFeedPreviewEvent[];
  locale: string;
  timeZone: string;
}) {
  const t = useTranslations("admin.testing.calendarFeed");

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t("columnWhen")}</th>
            <th className="px-3 py-2 font-medium">{t("columnSummary")}</th>
            <th className="px-3 py-2 font-medium">{t("columnGamer")}</th>
            <th className="px-3 py-2 font-medium">{t("columnProduct")}</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.uid} className="border-t border-border">
              <td className="whitespace-nowrap px-3 py-2">
                <span className="block">
                  {formatDate(event.start, locale, {
                    timeZone,
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatTimeRange(event.start, event.end, locale, timeZone)}
                </span>
              </td>
              <td className="px-3 py-2">
                {event.summary}
                {event.recurring && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t("recurring")}
                  </span>
                )}
              </td>
              <td className="px-3 py-2">{event.gamerName}</td>
              <td className="px-3 py-2">{event.productName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CalendarFeedCard() {
  const t = useTranslations("admin.testing.calendarFeed");
  const productTypeNoun = useTranslations("productType");
  const locale = useLocale();

  const [customer, setCustomer] = useState("");
  const [options, setOptions] = useState<CalendarFeedOptions>({
    ...CALENDAR_FEED_DEFAULTS,
  });
  // Held from the click until the answer lands, so the button cannot re-enable
  // for the frame between React Query settling and this component re-rendering.
  const [lookingUp, setLookingUp] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [resolved, setResolved] = useState<CalendarFeedLookupResponse | null>(
    null,
  );
  /**
   * The browser describing itself: the origin the URLs are built on, and the
   * zone the preview's clock faces are rendered in.
   *
   * Read in the lookup handler rather than in an effect, because that is the
   * first moment anything needs it and an event handler is where a value from
   * outside React belongs. Reading it during render would be a hydration
   * mismatch — the server has neither a `window.location` nor the reader's
   * zone — and reading it in a mount effect would be a cascading render for a
   * value nothing on the first paint uses.
   */
  const [browserContext, setBrowserContext] = useState<{
    origin: string;
    timeZone: string;
  } | null>(null);

  const lookup = useCalendarFeedLookup();
  const preview = useCalendarFeedPreview();

  const urls =
    browserContext === null || resolved === null
      ? null
      : buildFeedUrls(browserContext.origin, resolved.token, options);

  function setOption<K extends keyof CalendarFeedOptions>(
    key: K,
    value: CalendarFeedOptions[K],
  ) {
    setOptions((previous) => ({ ...previous, [key]: value }));
  }

  function handleLookup() {
    setLookingUp(true);
    setBrowserContext({
      origin: window.location.origin,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    // A new family invalidates the old preview outright — leaving one on screen
    // would attribute one household's sessions to another.
    preview.reset();
    lookup.mutate(customer, {
      onSuccess: (data) => {
        setResolved(data);
        // The previous family's gamer may not exist in this one.
        setOption("scope", CALENDAR_FEED_DEFAULTS.scope);
      },
      onSettled: () => setLookingUp(false),
    });
  }

  function handlePreview() {
    if (urls === null) return;
    setPreviewing(true);
    preview.mutate(
      { jsonUrl: urls.json, icsUrl: urls.https },
      { onSettled: () => setPreviewing(false) },
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          <CardTitle>{t("title")}</CardTitle>
        </div>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* --- 1. Customer --- */}
        <div className="space-y-4">
          <Field label={t("customerLabel")} htmlFor="calendar-feed-customer">
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Input
                id="calendar-feed-customer"
                value={customer}
                onChange={(event) => setCustomer(event.target.value)}
                placeholder={t("customerPlaceholder")}
              />
              <Button
                type="button"
                disabled={lookingUp || customer.trim() === ""}
                onClick={handleLookup}
              >
                {lookingUp ? t("lookingUp") : t("lookUp")}
              </Button>
            </div>
          </Field>

          {lookup.error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {lookup.error.message}
            </div>
          )}

          {resolved && (
            <div className="rounded-md border border-border p-4">
              <p className="text-sm font-medium">{resolved.customerName}</p>
              {resolved.participations.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("noParticipations")}
                </p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {resolved.participations.map((participation) => (
                    <li key={participation.id}>
                      {t("seatLine", {
                        gamer: participation.participantFirstName,
                        product: participation.productName,
                        type: productTypeNoun(participation.productType),
                      })}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* --- 2. Options --- */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("optionsHeading")}
          </h3>
          {/* Admin surfaces are desktop-default, so the knobs use the width. */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label={t("modeLabel")} htmlFor="calendar-feed-mode">
              <select
                id="calendar-feed-mode"
                className={selectClass}
                value={options.mode}
                onChange={(event) => {
                  const value = findOption(MODE_VALUES, event.target.value);
                  if (value) setOption("mode", value);
                }}
              >
                {MODE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t(`modeOptions.${value}`)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("titleLabel")} htmlFor="calendar-feed-title">
              <select
                id="calendar-feed-title"
                className={selectClass}
                value={options.title}
                onChange={(event) => {
                  const value = findOption(TITLE_VALUES, event.target.value);
                  if (value) setOption("title", value);
                }}
              >
                {TITLE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t(`titleOptions.${value}`)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("alarmLabel")} htmlFor="calendar-feed-alarm">
              <select
                id="calendar-feed-alarm"
                className={selectClass}
                value={options.alarm}
                onChange={(event) => {
                  const value = findOption(ALARM_VALUES, event.target.value);
                  if (value) setOption("alarm", value);
                }}
              >
                {ALARM_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t(`alarmOptions.${value}`)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("tzLabel")} htmlFor="calendar-feed-tz">
              <select
                id="calendar-feed-tz"
                className={selectClass}
                value={options.tz}
                onChange={(event) => {
                  const value = findOption(TZ_VALUES, event.target.value);
                  if (value) setOption("tz", value);
                }}
              >
                {TZ_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t(`tzOptions.${value}`)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("weeksLabel")} htmlFor="calendar-feed-weeks">
              <select
                id="calendar-feed-weeks"
                className={selectClass}
                value={options.weeks}
                onChange={(event) => {
                  const value = findOption(WEEKS_VALUES, event.target.value);
                  if (value) setOption("weeks", value);
                }}
              >
                {WEEKS_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t("weeksOption", { weeks: value })}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("scopeLabel")} htmlFor="calendar-feed-scope">
              <select
                id="calendar-feed-scope"
                className={selectClass}
                disabled={resolved === null}
                value={options.scope}
                onChange={(event) => setOption("scope", event.target.value)}
              >
                <option value={CALENDAR_FEED_DEFAULTS.scope}>
                  {t("scopeFamily")}
                </option>
                {resolved?.gamers.map((gamer) => (
                  <option
                    key={gamer.participantId}
                    value={`gamer:${gamer.participantId}`}
                  >
                    {gamer.firstName}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("detailsLabel")} htmlFor="calendar-feed-details">
              <select
                id="calendar-feed-details"
                className={selectClass}
                value={options.details}
                onChange={(event) => {
                  const value = findOption(DETAILS_VALUES, event.target.value);
                  if (value) setOption("details", value);
                }}
              >
                {DETAILS_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t(`detailsOptions.${value}`)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("busyLabel")} htmlFor="calendar-feed-busy">
              <select
                id="calendar-feed-busy"
                className={selectClass}
                value={options.busy}
                onChange={(event) => {
                  const value = findOption(BUSY_VALUES, event.target.value);
                  if (value) setOption("busy", value);
                }}
              >
                {BUSY_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t(`busyOptions.${value}`)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("refreshLabel")} htmlFor="calendar-feed-refresh">
              <select
                id="calendar-feed-refresh"
                className={selectClass}
                value={options.refresh}
                onChange={(event) => {
                  const value = findOption(REFRESH_VALUES, event.target.value);
                  if (value) setOption("refresh", value);
                }}
              >
                {REFRESH_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t(`refreshOptions.${value}`)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("colorLabel")} htmlFor="calendar-feed-color">
              <select
                id="calendar-feed-color"
                className={selectClass}
                value={options.color}
                onChange={(event) => {
                  const value = findOption(COLOR_VALUES, event.target.value);
                  if (value) setOption("color", value);
                }}
              >
                {COLOR_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t(`colorOptions.${value}`)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("calnameLabel")} htmlFor="calendar-feed-calname">
              <Input
                id="calendar-feed-calname"
                value={options.calname}
                maxLength={CALNAME_MAX_LENGTH}
                onChange={(event) => setOption("calname", event.target.value)}
              />
            </Field>
          </div>
        </div>

        {/* --- 3. Feed URL ---
            The box holds its height whether or not there is a URL in it, so
            resolving a customer fills a space that was already there instead of
            pushing the preview below it down the page. */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("feedUrlHeading")}
          </h3>
          <div className="min-h-36 space-y-4 rounded-md border border-border p-4">
            {urls && (
              <>
                <UrlRow
                  id="calendar-feed-https"
                  label={t("webUrlLabel")}
                  value={urls.https}
                />
                <UrlRow
                  id="calendar-feed-webcal"
                  label={t("subscriptionUrlLabel")}
                  value={urls.webcal}
                />
              </>
            )}
          </div>
        </div>

        {/* --- 4. Preview --- */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("previewHeading")}
          </h3>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              disabled={previewing || urls === null}
              onClick={handlePreview}
            >
              {previewing ? t("loadingPreview") : t("loadPreview")}
            </Button>
          </div>

          {preview.error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {preview.error.message}
            </div>
          )}

          <div
            className={cn(
              PREVIEW_MIN_HEIGHT,
              "rounded-md border border-border",
            )}
          >
            {previewing ? (
              <PreviewSkeleton />
            ) : preview.data && browserContext ? (
              preview.data.preview.events.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {t("noEvents")}
                </p>
              ) : (
                <PreviewTable
                  events={preview.data.preview.events}
                  locale={locale}
                  timeZone={browserContext.timeZone}
                />
              )
            ) : null}
          </div>

          {/* The raw document arrives with the table above it, so opening this
              section is the only thing that ever moves what is below it. */}
          {preview.data && (
            <details className="rounded-md border border-border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                {t("rawHeading")}
              </summary>
              <div className="space-y-2 border-t border-border p-4">
                <div className="flex justify-end">
                  <CopyButton value={preview.data.raw} />
                </div>
                <pre className="max-h-96 overflow-auto rounded bg-muted p-3 font-mono text-xs">
                  {preview.data.raw}
                </pre>
              </div>
            </details>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
