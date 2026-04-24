"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ScheduleSlotDraft {
  weekday: number; // 0=Mon .. 6=Sun
  start_time: string; // HH:MM
  duration_minutes: number;
}

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

interface ScheduleSlotsEditorProps {
  slots: ScheduleSlotDraft[];
  onChange: (slots: ScheduleSlotDraft[]) => void;
  allowMultiple: boolean;
  disabled?: boolean;
}

export function ScheduleSlotsEditor({
  slots,
  onChange,
  allowMultiple,
  disabled,
}: ScheduleSlotsEditorProps) {
  const t = useTranslations("admin.productsV2.schedule");
  const w = useTranslations("admin.productsV2.weekdays");

  function updateSlot(idx: number, patch: Partial<ScheduleSlotDraft>) {
    onChange(slots.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function addSlot() {
    const usedDays = new Set(slots.map((s) => s.weekday));
    const firstFree = [0, 1, 2, 3, 4, 5, 6].find((d) => !usedDays.has(d)) ?? 0;
    onChange([
      ...slots,
      { weekday: firstFree, start_time: "16:00", duration_minutes: 60 },
    ]);
  }

  function removeSlot(idx: number) {
    onChange(slots.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-3">
      {slots.map((slot, idx) => (
        <div
          key={idx}
          className="flex flex-wrap items-end gap-3 rounded-md border border-input p-3"
        >
          <div className="space-y-1">
            <Label htmlFor={`slot-day-${idx}`}>{t("day")}</Label>
            <select
              id={`slot-day-${idx}`}
              value={slot.weekday}
              onChange={(e) =>
                updateSlot(idx, { weekday: Number(e.target.value) })
              }
              disabled={disabled}
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {WEEKDAY_KEYS.map((key, day) => (
                <option key={day} value={day}>
                  {w(key)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`slot-time-${idx}`}>{t("startTime")}</Label>
            <Input
              id={`slot-time-${idx}`}
              type="time"
              value={slot.start_time.slice(0, 5)}
              onChange={(e) => updateSlot(idx, { start_time: e.target.value })}
              disabled={disabled}
              className="w-32"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`slot-duration-${idx}`}>{t("durationMin")}</Label>
            <Input
              id={`slot-duration-${idx}`}
              type="number"
              min={1}
              value={slot.duration_minutes}
              onChange={(e) =>
                updateSlot(idx, { duration_minutes: Number(e.target.value) })
              }
              disabled={disabled}
              className="w-28"
            />
          </div>
          {allowMultiple && slots.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeSlot(idx)}
              disabled={disabled}
              aria-label={t("removeSlot")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      {allowMultiple && slots.length < 7 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addSlot}
          disabled={disabled}
        >
          <Plus className="mr-1 h-4 w-4" />
          {t("addDay")}
        </Button>
      )}
    </div>
  );
}
