"use client";

import { Clock, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductType } from "@/types";

export interface ScheduleSlotDraft {
  weekday: number; // 0=Mon..6=Sun
  start_time: string; // HH:MM
  duration_minutes: number;
}

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

// Chrome's native <input type="time"> picker ignores the `step` attribute in
// its dropdown (only form validation respects it), so the time field is
// split into two selects: hour + 15-minute-interval minute.
const HOUR_OPTIONS: string[] = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0")
);
const MINUTE_OPTIONS: string[] = ["00", "15", "30", "45"];

interface ScheduleSlotsEditorProps {
  productType: ProductType;
  slots: ScheduleSlotDraft[];
  onChange: (slots: ScheduleSlotDraft[]) => void;
  disabled?: boolean;
}

export function ScheduleSlotsEditor({
  productType,
  slots,
  onChange,
  disabled,
}: ScheduleSlotsEditorProps) {
  const t = useTranslations("admin.products.schedule");
  const w = useTranslations("admin.products.weekdays");
  const multiDay = productType === "camp";
  const singleSlot = productType === "event" || !multiDay;

  function updateSlot(idx: number, patch: Partial<ScheduleSlotDraft>) {
    onChange(slots.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function removeSlot(idx: number) {
    onChange(slots.filter((_, i) => i !== idx));
  }

  function addSlot() {
    const used = new Set(slots.map((s) => s.weekday));
    const next = [0, 1, 2, 3, 4, 5, 6].find((d) => !used.has(d)) ?? 0;
    onChange([
      ...slots,
      { weekday: next, start_time: "10:00", duration_minutes: 90 },
    ]);
  }

  return (
    <div className="space-y-3">
      {slots.map((slot, i) => (
        <div
          key={i}
          className="grid grid-cols-12 gap-2 rounded-md border border-input bg-muted/20 p-3"
        >
          <div className="col-span-12 sm:col-span-5">
            {productType === "event" ? (
              <div className="flex h-10 items-center px-2 text-sm text-muted-foreground">
                {t("sameAsEventDate")}
              </div>
            ) : (
              <select
                aria-label={t("day")}
                value={slot.weekday}
                onChange={(e) =>
                  updateSlot(i, { weekday: Number(e.target.value) })
                }
                disabled={disabled}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {WEEKDAY_KEYS.map((key, day) => (
                  <option key={day} value={day}>
                    {w(`${key}Long`)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="col-span-6 flex items-center gap-1 sm:col-span-3">
            <select
              aria-label={t("hour")}
              value={slot.start_time.slice(0, 2)}
              onChange={(e) =>
                updateSlot(i, {
                  start_time: `${e.target.value}:${slot.start_time.slice(3, 5)}`,
                })
              }
              disabled={disabled}
              className="flex h-10 flex-1 rounded-md border border-input bg-background px-2 text-sm"
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">:</span>
            <select
              aria-label={t("minute")}
              value={slot.start_time.slice(3, 5)}
              onChange={(e) =>
                updateSlot(i, {
                  start_time: `${slot.start_time.slice(0, 2)}:${e.target.value}`,
                })
              }
              disabled={disabled}
              className="flex h-10 flex-1 rounded-md border border-input bg-background px-2 text-sm"
            >
              {MINUTE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-5 sm:col-span-3">
            <div className="flex items-center gap-1">
              <Input
                aria-label={t("durationMin")}
                type="number"
                min="1"
                value={slot.duration_minutes}
                onChange={(e) =>
                  updateSlot(i, { duration_minutes: Number(e.target.value) })
                }
                disabled={disabled}
                className="h-10"
              />
              <span className="shrink-0 text-xs text-muted-foreground">
                {t("minSuffix")}
              </span>
            </div>
          </div>
          <div className="col-span-1 flex items-center justify-end">
            {multiDay && slots.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeSlot(i)}
                disabled={disabled}
                aria-label={t("removeSlot")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
      {multiDay && slots.length < 7 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addSlot}
          disabled={disabled}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          {t("addDay")}
        </Button>
      )}
      {singleSlot && (
        <p className="text-xs text-muted-foreground">
          <Clock className="mr-1 inline h-3 w-3" />
          {productType === "event"
            ? t("oneSessionEvent")
            : t("oneSessionPerWeek")}
        </p>
      )}
    </div>
  );
}
