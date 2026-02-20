"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_CONFIG,
  type SupportedCurrency,
} from "@/lib/constants/currency";
import { cn } from "@/lib/utils";

export function CurrencyPicker({ className }: { className?: string }) {
  const { currency, setCurrency } = useCurrency();
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

  const config = CURRENCY_CONFIG[currency];

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label="Select currency"
      >
        <span>{config.symbol}</span>
        <span className="hidden sm:inline">{config.label}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-28 rounded-md border border-border bg-card py-1 shadow-lg">
          {SUPPORTED_CURRENCIES.map((c) => {
            const opt = CURRENCY_CONFIG[c];
            return (
              <button
                key={c}
                onClick={() => {
                  setCurrency(c as SupportedCurrency);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
                  c === currency && "font-semibold text-primary"
                )}
              >
                <span className="w-4 text-center">{opt.symbol}</span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
