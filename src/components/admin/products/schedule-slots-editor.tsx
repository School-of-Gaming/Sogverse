"use client";

import { Clock, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  addMinutes,
  hourOf,
  minutesBetween,
  minuteOf,
  withHour,
  withMinute,
} from "@/lib/time-of-day";
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

// Smallest selectable session length. The time picker is on a 15-minute grid,
// so the shortest gap between start and a later end is one step.
const MIN_DURATION_MINUTES = 15;

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

  // The data model stores start_time + duration_minutes, but admins think in
  // start/end, so the editor shows an end-time picker and recomputes the stored
  // duration when it changes. Changing the *start* (handled inline) keeps the
  // duration, so the session slides while its length holds.
  function setEndTime(idx: number, slot: ScheduleSlotDraft, endTime: string) {
    const duration = minutesBetween(slot.start_time, endTime);
    updateSlot(idx, {
      duration_minutes: Math.max(MIN_DURATION_MINUTES, duration),
    });
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
      {slots.map((slot, i) => {
        const endTime = addMinutes(slot.start_time, slot.duration_minutes);
        return (
        <div
          key={i}
          className="grid grid-cols-12 gap-2 rounded-md border border-input bg-muted/20 p-3"
        >
          <div className="col-span-12 sm:col-span-4">
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
          <div className="col-span-11 flex flex-wrap items-center gap-x-2 gap-y-2 sm:col-span-7">
            <div className="flex items-center gap-1">
              <select
                aria-label={t("startHour")}
                value={hourOf(slot.start_time)}
                onChange={(e) =>
                  updateSlot(i, {
                    start_time: withHour(slot.start_time, Number(e.target.value)),
                  })
                }
                disabled={disabled}
                className="flex h-10 w-16 rounded-md border border-input bg-background px-2 text-sm"
              >
                {HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <span className="text-muted-foreground">:</span>
              <select
                aria-label={t("startMinute")}
                value={minuteOf(slot.start_time)}
                onChange={(e) =>
                  updateSlot(i, {
                    start_time: withMinute(
                      slot.start_time,
                      Number(e.target.value)
                    ),
                  })
                }
                disabled={disabled}
                className="flex h-10 w-16 rounded-md border border-input bg-background px-2 text-sm"
              >
                {MINUTE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-xs text-muted-foreground">{t("to")}</span>
            <div className="flex items-center gap-1">
              <select
                aria-label={t("endHour")}
                value={hourOf(endTime)}
                onChange={(e) =>
                  setEndTime(i, slot, withHour(endTime, Number(e.target.value)))
                }
                disabled={disabled}
                className="flex h-10 w-16 rounded-md border border-input bg-background px-2 text-sm"
              >
                {HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <span className="text-muted-foreground">:</span>
              <select
                aria-label={t("endMinute")}
                value={minuteOf(endTime)}
                onChange={(e) =>
                  setEndTime(i, slot, withMinute(endTime, Number(e.target.value)))
                }
                disabled={disabled}
                className="flex h-10 w-16 rounded-md border border-input bg-background px-2 text-sm"
              >
                {MINUTE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
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
        );
      })}
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
