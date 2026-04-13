"use client";

/**
 * Dropdown in the site header for choosing the UI locale — which translation
 * of the web app the user sees. Backed by `profiles.locale` via the
 * LocaleProvider.
 *
 * Not the user's spoken-language preference. For that, see
 * src/components/ui/spoken-language-checkboxes.tsx and
 * docs/i18n-architecture.md.
 */

import { useState, useRef } from "react";
import { ChevronDown } from "lucide-react";
import flags from "react-phone-number-input/flags";
import { useTranslations } from "next-intl";
import { useClickOutside } from "@/hooks/use-click-outside";
import { useLocalePreference } from "@/hooks/use-locale-preference";
import {
  SUPPORTED_LOCALES,
  LOCALE_CONFIG,
} from "@/lib/constants/locales";
import { cn } from "@/lib/utils";

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
  const Flag = flags[country as keyof typeof flags];
  return Flag ? <Flag title={nativeLabel} /> : null;
}

export function LocalePicker({ className }: { className?: string }) {
  const { locale, setLocale } = useLocalePreference();
  const c = useTranslations('common');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false));

  const config = LOCALE_CONFIG[locale];

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label={c('selectLanguage')}
      >
        <span className="h-4 w-6 [&>svg]:h-full">
          <FlagComponent country={config.country} nativeLabel={config.nativeLabel} />
        </span>
        <span className="hidden sm:inline">{locale.toUpperCase()}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-36 rounded-md border border-border bg-card py-1 shadow-lg">
          {SUPPORTED_LOCALES.map((opt) => {
            const cfg = LOCALE_CONFIG[opt];
            return (
              <button
                key={opt}
                onClick={() => {
                  setLocale(opt);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
                  opt === locale && "font-semibold text-primary",
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
