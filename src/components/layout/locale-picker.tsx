"use client";

/**
 * Dropdown in the site header for choosing the UI locale — which translation
 * of the web app the user sees. Backed by `profiles.locale` via the
 * LocaleProvider.
 *
 * Not the user's spoken-language preference. For that, see
 * src/components/ui/spoken-language-checkboxes.tsx and
 * src/i18n/CLAUDE.md.
 */

import { useState, useRef } from "react";
import {
  useParams,
  useSearchParams,
  useRouter as useRawRouter,
} from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, getPathname } from "@/i18n/navigation";
import { FLAGS } from "@/components/ui/flags";
import { useClickOutside } from "@/hooks/use-click-outside";
import { useLocaleControl } from "@/providers";
import {
  SUPPORTED_LOCALES,
  LOCALE_CONFIG,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { trackLocalePickerOpen } from "@/lib/analytics";
import { cn, isKeyOf } from "@/lib/utils";

// Klingon Empire flag from Wikimedia Commons (by Oren neu dag, public domain).
// Simplified from the original Inkscape SVG to a minimal inline component.
// https://commons.wikimedia.org/wiki/File:Klingon_Empire_Flag.svg
function KlingonFlag({ title }: { title?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1533 977"
      aria-label={title}
      role="img"
    >
      <rect width="1533" height="977" fill="#d00" />
      <ellipse cx="774" cy="523" rx="303" ry="299" fill="#fff" />
      <g fill="#000" transform="translate(491.95,59.95) scale(1.6375,1.8135) translate(-15.16,-17.54)">
        <path d="M189 375.6c22-33.3 42-52.3 64-85.6-5-20.7-25.8-9.1-63.2-268.1-42.3 260.9-65 249.6-67.2 266.1 21.5 33.9 44.9 53.6 66.4 87.6z" />
        <path d="M111.1 308.5c16.7 23.3 47.9 55.5 64.7 78.8C75 393.3 54.3 415.3 19.9 447.8 13.7 340.2 93 340.7 111.1 308.5z" />
        <path d="M202.8 386.7c19.4-25.2 43.8-55.6 63.2-80.9 32.9 60.9 75.6 79.6 115.5 82.7-31.2 39.8-111.4 35.3-178.7-1.8z" />
      </g>
    </svg>
  );
}

function FlagComponent({
  country,
  nativeLabel,
}: {
  country: string;
  nativeLabel: string;
}) {
  if (country === "KLINGON") {
    return <KlingonFlag title={nativeLabel} />;
  }
  const Flag = isKeyOf(FLAGS, country) ? FLAGS[country] : undefined;
  return Flag ? <Flag title={nativeLabel} /> : null;
}

export function LocalePicker({ className }: { className?: string }) {
  const { locale, setLocale, detectedLocale } = useLocaleControl();
  const c = useTranslations('common');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // The **wrapped** pathname: the internal route template, its locale prefix
  // stripped and its slug untranslated, so `/fi/kauppa/abc` arrives here as
  // `/shop/[id]`. The concrete values come from `useParams()` — handing
  // next-intl the template alone would put a literal `[id]` in the address bar.
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useSearchParams();
  // The raw router, because this call site *embeds a pathname in a URL*: the
  // destination is built by `getPathname` and then has to carry the fragment,
  // and no typed href has a `hash` field to carry one in.
  const router = useRawRouter();

  useClickOutside(ref, () => setOpen(false));

  /**
   * Persist the choice, then re-issue this very page under the new prefix.
   *
   * **`replace`, not `push`** — Back should return the reader to the previous
   * *page*, not to the previous language.
   *
   * The query string rides along: dropping it would strand a switch on
   * `/shop?category=camps` or on a `?session_id=…` confirmation page. The
   * fragment is appended by hand for the reason given at the router above.
   *
   * Persistence flows one way only, and only from here: the cookie and the
   * profile are written because someone *chose* a language. Visiting a
   * prefixed URL is reading, and writes nothing.
   */
  function chooseLocale(next: SupportedLocale) {
    setLocale(next);
    setOpen(false);

    // **Built with `getAll`, so a repeated key survives as an array.**
    // `Object.fromEntries(entries())` keeps only the last value of a repeated
    // key, which silently drops half of a multi-select filter
    // (`?topic=minecraft&topic=roblox`) on a language switch. next-intl's query
    // serializer takes an array and re-emits every value.
    const query = Object.fromEntries(
      [...new Set(searchParams.keys())].map((key) => {
        const values = searchParams.getAll(key);
        return [key, values.length > 1 ? values : values[0]];
      }),
    );
    const hash = typeof window === "undefined" ? "" : window.location.hash;
    const target = getPathname({
      // @ts-expect-error -- next-intl's own locale-switcher shape. `pathname`
      // is the union of every declared route while `params` is the loose
      // record `useParams()` returns, so the compiler cannot pair one route's
      // params against all of them; at runtime the two came out of the same
      // URL and always agree. A cast is not the alternative — this repo bans
      // type assertions outright.
      href: { pathname, params, query },
      locale: next,
    });

    router.replace(`${target}${hash}`);
  }

  const config = LOCALE_CONFIG[locale];

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        onClick={() => {
          // Only the closed → open transition is an event. Someone opening the
          // dropdown and closing it again has looked at the languages once, and
          // that one look is what separates "never noticed the selector" from
          // "noticed it and stayed" for a visitor who never changes locale —
          // counting the close too would double every such visit.
          if (!open) {
            trackLocalePickerOpen({
              detected: detectedLocale,
              current: locale,
            });
          }
          setOpen(!open);
        }}
        className="flex items-center gap-1 rounded-md border border-border bg-lifted px-2 py-1 text-sm font-medium transition-colors hover:border-foreground hover:text-foreground"
        aria-label={c('selectLanguage')}
      >
        <span className="h-4 w-6 [&>svg]:h-full">
          <FlagComponent country={config.country} nativeLabel={config.nativeLabel} />
        </span>
        <span className="hidden sm:inline">{locale.toUpperCase()}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-36 rounded-md border border-border bg-card py-1 shadow-lg">
          {SUPPORTED_LOCALES.map((opt) => {
            const cfg = LOCALE_CONFIG[opt];
            return (
              <button
                key={opt}
                onClick={() => {
                  chooseLocale(opt);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-hover hover:text-foreground",
                  opt === locale && "font-semibold text-act",
                )}
              >
                <span className="h-4 w-6 [&>svg]:h-full">
                  <FlagComponent country={cfg.country} nativeLabel={cfg.nativeLabel} />
                </span>
                <span>{cfg.nativeLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
