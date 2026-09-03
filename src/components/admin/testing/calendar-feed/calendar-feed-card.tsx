"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
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
import { cn, formatDate } from "@/lib/utils";
import {
  CALENDAR_FEED_DEFAULTS,
  calendarFeedQuery,
  type CalendarFeedOptions,
} from "@/lib/calendar-feed/options";
import {
  useCalendarFeedLookup,
  useCalendarFeedPreview,
  useCalendarFeedSandbox,
  type CalendarFeedLookupResponse,
} from "@/services/calendar-feed";
import { FeedOptions, type ScopeChoice } from "./feed-options";
import { FeedPreview } from "./feed-preview";
import { RealAccountLookup } from "./real-account-lookup";
import { SandboxEditor } from "./sandbox-editor";
import { SectionHeading } from "./shared";
import { SubscribeRow } from "./subscribe-row";

/**
 * The calendar-feed card: a standing admin tool for verifying the subscribed
 * feed in isolation.
 *
 * It exists because the interesting questions here are not answerable in code.
 * What Apple, Google and Outlook each *do* with a `VALARM`, an `RRULE` or a
 * `TZID` can only be found out by subscribing three clients to three URLs and
 * looking — and what a client does when the underlying data *changes* can only
 * be found out by changing it and waiting for the next poll. So the card offers
 * two sources behind one feed route:
 *
 * - **A sandbox family**, the default: a fake household stored as one row,
 *   edited here and served by the same route. Nothing real is disturbed, and
 *   the whole point is that it can be rewritten between polls.
 * - **A real account**, resolved by email or id: the same feed over a real
 *   family, which is the only thing that proves the mechanics describe a real
 *   household correctly.
 *
 * Both produce the same three subscribe links and the same preview, because
 * both go through the same pipeline behind the same URL shape.
 */

/** Which family the URLs on screen are about. */
type Source = "sandbox" | "real";

/**
 * The browser describing itself: the origin the URLs are built on, and the zone
 * the clock faces on this card are rendered in.
 *
 * Neither exists on the server, so reading them during render is a hydration
 * mismatch — and neither changes for the life of the document, so there is
 * nothing to subscribe to. `useSyncExternalStore` is exactly the shape for
 * that: the server snapshot is `null`, the client snapshot is the cached pair,
 * and React does the one extra render on hydration rather than an effect
 * setting state. Cached at module scope so the snapshot is referentially
 * stable, which the hook requires.
 */
interface BrowserContext {
  origin: string;
  timeZone: string;
}

let cachedBrowserContext: BrowserContext | null = null;

function readBrowserContext(): BrowserContext {
  cachedBrowserContext ??= {
    origin: window.location.origin,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  return cachedBrowserContext;
}

/** Nothing ever changes, so the subscription is a no-op with a no-op teardown. */
const subscribeToNothing = () => () => undefined;

const noBrowserContext = () => null;

function useBrowserContext(): BrowserContext | null {
  return useSyncExternalStore(
    subscribeToNothing,
    readBrowserContext,
    noBrowserContext,
  );
}

interface FeedUrls {
  https: string;
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
    json: `${origin}${path}${query === "" ? "?" : "&"}format=json`,
  };
}

export function CalendarFeedCard() {
  const t = useTranslations("admin.testing.calendarFeed");
  const locale = useLocale();

  const [source, setSource] = useState<Source>("sandbox");
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

  const browser = useBrowserContext();

  // One row by primary key, created server-side on a first read — a
  // near-instant call, so the editor's container simply holds nothing until it
  // lands rather than showing a skeleton for a frame or two.
  const sandbox = useCalendarFeedSandbox();
  const lookup = useCalendarFeedLookup();
  const preview = useCalendarFeedPreview();

  const token =
    source === "sandbox" ? (sandbox.data?.token ?? null) : (resolved?.token ?? null);

  const urls =
    browser === null || token === null
      ? null
      : buildFeedUrls(browser.origin, token, options);

  const scopeChoices: readonly ScopeChoice[] = useMemo(() => {
    if (source === "real") return resolved?.gamers ?? [];
    return (
      sandbox.data?.definition.gamers.map((gamer) => ({
        participantId: gamer.id,
        firstName: gamer.firstName,
      })) ?? []
    );
  }, [source, resolved, sandbox.data]);

  function setOption<K extends keyof CalendarFeedOptions>(
    key: K,
    value: CalendarFeedOptions[K],
  ) {
    setOptions((previous) => ({ ...previous, [key]: value }));
  }

  function switchSource(next: Source) {
    if (next === source) return;
    setSource(next);
    // A different family invalidates the old preview and the old per-gamer
    // scope outright — leaving either on screen would attribute one household's
    // sessions to another.
    preview.reset();
    setOption("scope", CALENDAR_FEED_DEFAULTS.scope);
  }

  function handleLookup() {
    setLookingUp(true);
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
    // One request: the JSON rendering carries the document as well as the
    // events, so the table and the raw `.ics` below it are one poll.
    preview.mutate(urls.json, { onSettled: () => setPreviewing(false) });
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
        {/* --- 1. Which family --- */}
        <div className="space-y-3">
          <SectionHeading>{t("sourceHeading")}</SectionHeading>
          <div className="flex flex-wrap gap-2">
            <SourceButton
              active={source === "sandbox"}
              label={t("sourceSandbox")}
              onClick={() => switchSource("sandbox")}
            />
            <SourceButton
              active={source === "real"}
              label={t("sourceReal")}
              onClick={() => switchSource("real")}
            />
          </div>
          {source === "real" && (
            <RealAccountLookup
              value={customer}
              onChange={setCustomer}
              onLookUp={handleLookup}
              lookingUp={lookingUp}
              errorMessage={lookup.error?.message ?? null}
              resolved={resolved}
            />
          )}
          {source === "sandbox" && sandbox.error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {sandbox.error.message}
            </div>
          )}
        </div>

        {/* --- 2. Options --- */}
        <FeedOptions
          options={options}
          onChange={setOption}
          scopeChoices={scopeChoices}
        />

        {/* --- 3. Subscribe --- */}
        <SubscribeRow feedUrl={urls?.https ?? null} calendarName={options.calname} />

        {/* --- 4. Preview --- */}
        <FeedPreview
          events={preview.data?.events ?? null}
          ics={preview.data?.ics ?? null}
          timeZone={browser?.timeZone ?? null}
          loading={previewing}
          canLoad={urls !== null}
          onLoad={handlePreview}
          errorMessage={preview.error?.message ?? null}
        />

        {/* --- 5. The sandbox family ---
            Last on purpose, and the order is load-bearing: this is the one
            section whose height is decided by a round trip, so putting it at
            the end means its arrival grows the card downward instead of pushing
            four settled sections down the viewport. A later tidy-up that moves
            it up beside the source switch — which reads like an improvement —
            would reintroduce exactly that shift. */}
        {source === "sandbox" && sandbox.data && browser !== null && (
          <SandboxEditor
            saved={sandbox.data.definition}
            // The admin's own clock face: a save is a moment they were present
            // for, so it is stated in the zone they are sitting in.
            savedAtLabel={formatDate(sandbox.data.updatedAt, locale, {
              timeZone: browser.timeZone,
              dateStyle: "medium",
              timeStyle: "short",
            })}
          />
        )}
      </CardContent>
    </Card>
  );
}

/** One half of the source switch: a pressed-state toggle, not a link. */
function SourceButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      aria-pressed={active}
      className={cn(active && "pointer-events-none")}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
