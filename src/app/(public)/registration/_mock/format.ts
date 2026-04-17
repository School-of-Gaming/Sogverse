// Formatting helpers scoped to the registration mockup.

const DAY_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function formatDayEn(day: number): string {
  return DAY_EN[day] ?? "";
}

export function formatRange(startTime: string, endTime: string): string {
  return `${startTime}–${endTime}`;
}

// "Apr 20, 2026 at 18:00 EEST"
export function formatWhen(d: Date): string {
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const tz =
    d
      .toLocaleTimeString("en-US", { timeZoneName: "short" })
      .split(" ")
      .pop() ?? "";
  return `${date} at ${time} ${tz}`;
}

export function formatServerClock(d: Date): string {
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const tz =
    d
      .toLocaleTimeString("en-US", { timeZoneName: "short" })
      .split(" ")
      .pop() ?? "";
  return `${time} ${tz}`;
}

export function formatIsoDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export type Countdown = {
  done: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
};

export function buildCountdown(target: Date, now: number): Countdown {
  const totalMs = target.getTime() - now;
  if (totalMs <= 0) {
    return { done: true, days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  }
  const totalSec = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { done: false, days, hours, minutes, seconds, totalMs };
}

export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}
