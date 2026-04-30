"use client";

import { useLocale } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import {
  computeProductSessions,
  type ProductCalendarInput,
} from "./compute-product-sessions";
import { SessionCalendarView } from "./session-calendar-view";

// Adapter: turns a product's raw schedule + holidays into the resolved
// arrays the View renders. Returns null when the product doesn't have
// enough info for a useful calendar (e.g., one-off events) — caller
// should hide the surrounding "When this {type} meets" section.

interface ProductSessionCalendarProps {
  product: ProductCalendarInput;
}

export function ProductSessionCalendar({ product }: ProductSessionCalendarProps) {
  const uiLocale = resolveLocale(useLocale());
  const result = computeProductSessions(product);
  if (!result) return null;

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <SessionCalendarView
      rangeStart={result.rangeStart}
      rangeEnd={result.rangeEnd}
      sessions={result.sessions}
      skips={result.skips}
      locale={uiLocale}
      todayIso={todayIso}
    />
  );
}
