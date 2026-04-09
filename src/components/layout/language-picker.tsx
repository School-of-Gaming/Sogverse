"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import flags from "react-phone-number-input/flags";
import { useLanguagePreference } from "@/hooks/use-language-preference";
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_CONFIG,
} from "@/lib/constants/language-preference";
import { cn } from "@/lib/utils";

export function LanguagePicker({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguagePreference();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const config = LANGUAGE_CONFIG[language];
  const FlagIcon = flags[config.country as keyof typeof flags];

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label="Select language"
      >
        {FlagIcon && (
          <span className="h-4 w-6 [&>svg]:h-full">
            <FlagIcon title={config.nativeLabel} />
          </span>
        )}
        <span className="hidden sm:inline">{language.toUpperCase()}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-36 rounded-md border border-border bg-card py-1 shadow-lg">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const opt = LANGUAGE_CONFIG[lang];
            const LangFlag = flags[opt.country as keyof typeof flags];
            return (
              <button
                key={lang}
                onClick={() => {
                  setLanguage(lang);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
                  lang === language && "font-semibold text-primary",
                )}
              >
                {LangFlag && (
                  <span className="h-4 w-6 [&>svg]:h-full">
                    <LangFlag title={opt.nativeLabel} />
                  </span>
                )}
                <span>{opt.nativeLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
