"use client";

import { useTranslations } from "next-intl";
import type { HolidayCalendarWithDates } from "@/services/products";

interface HolidayCalendarOptionProps {
  calendar: HolidayCalendarWithDates;
  checked: boolean;
  onToggle: () => void;
}

export function HolidayCalendarOption({
  calendar,
  checked,
  onToggle,
}: HolidayCalendarOptionProps) {
  const t = useTranslations("admin.products.labels");
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = calendar.calendar_holidays.filter(
    (h) => h.date >= today
  );
  const years = Array.from(
    new Set(upcoming.map((h) => h.date.slice(0, 4)))
  ).sort();
  const yearSpan =
    years.length === 0
      ? null
      : years.length === 1
        ? years[0]
        : `${years[0]}–${years[years.length - 1]}`;
  // Dedupe reasons, preserve first-seen order so common ones land first.
  const uniqueNames: string[] = [];
  const seen = new Set<string>();
  for (const h of upcoming) {
    if (!h.reason || seen.has(h.reason)) continue;
    seen.add(h.reason);
    uniqueNames.push(h.reason);
  }

  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors ${
        checked
          ? "border-primary bg-primary/5"
          : "border-input hover:border-foreground/30"
      }`}
    >
      <input
        type="checkbox"
        className="mt-1 h-4 w-4"
        checked={checked}
        onChange={onToggle}
      />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{calendar.name}</div>
        {upcoming.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            {t("holidayNoUpcoming")}
          </div>
        ) : (
          <>
            <div className="text-xs font-medium text-muted-foreground">
              {yearSpan}
            </div>
            {uniqueNames.length > 0 && (
              <div className="mt-0.5 text-xs text-muted-foreground">
                {uniqueNames.join(", ")}
              </div>
            )}
          </>
        )}
      </div>
    </label>
  );
}
