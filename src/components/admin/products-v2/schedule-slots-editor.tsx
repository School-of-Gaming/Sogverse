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

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

function parseTime(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(":").map(Number);
  return { hour: h, minute: m };
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

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
            <Label htmlFor={`slot-hour-${idx}`}>{t("startTime")}</Label>
            <div className="flex items-center gap-1">
              <select
                id={`slot-hour-${idx}`}
                value={parseTime(slot.start_time).hour}
                onChange={(e) => {
                  const { minute } = parseTime(slot.start_time);
                  updateSlot(idx, {
                    start_time: formatTime(Number(e.target.value), minute),
                  });
                }}
                disabled={disabled}
                className="flex h-10 rounded-md border border-input bg-background px-2 py-2 text-sm"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <span className="text-muted-foreground">:</span>
              <select
                aria-label={t("startTime")}
                value={parseTime(slot.start_time).minute}
                onChange={(e) => {
                  const { hour } = parseTime(slot.start_time);
                  updateSlot(idx, {
                    start_time: formatTime(hour, Number(e.target.value)),
                  });
                }}
                disabled={disabled}
                className="flex h-10 rounded-md border border-input bg-background px-2 py-2 text-sm"
              >
                {MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
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
