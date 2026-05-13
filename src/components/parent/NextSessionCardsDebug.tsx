"use client";

import { useEffect, useState } from "react";
import {
  NextSessionCard,
  NextSessionCardSkeleton,
} from "./NextSessionCard";

// Hardcoded fixtures so the parent Sessions section renders something
// real while the adapter for `MyParticipationRow → NextSessionCardProps`
// is in flight. Remove this debug surface once the adapter lands.
// Start times anchor to the next round-hour boundary plus an integer
// number of hours so the demo always shows clean "16:00 – 18:00" style
// windows instead of "16:23 – 18:23". Sub-hour countdowns fall out
// naturally because the next-hour boundary is always within 60 minutes
// of "now".
const HOUR_MS = 3_600_000;
const SESSION_DURATION_MS = 2 * HOUR_MS;

const FIXTURES = [
  {
    gamer: "Alex",
    name: "Minecraft Survival Camp",
    voiceIsOpen: false,
    hoursAfterNextHour: 53, // ~2d 5h countdown
  },
  {
    gamer: "Sam",
    name: "Lego Robotics Camp",
    voiceIsOpen: false,
    hoursAfterNextHour: 8, // ~8h countdown
  },
  {
    gamer: "Riya",
    name: "Speedrun Academy Camp",
    voiceIsOpen: false,
    hoursAfterNextHour: 0, // <1h, exercises the minutes+seconds branch
  },
  {
    gamer: "Bobby",
    name: "Cosmic Builders Camp",
    voiceIsOpen: true,
    hoursAfterNextHour: -1, // live: started at the previous hour boundary
  },
] as const;

export function NextSessionCardsDebug() {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical post-hydration flag so SSR and client render match
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="space-y-3">
        <NextSessionCardSkeleton />
        <NextSessionCardSkeleton />
      </div>
    );
  }

  const nextHour = new Date();
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  const nextHourMs = nextHour.getTime();

  return (
    <div className="space-y-3">
      <NextSessionCardSkeleton />
      {FIXTURES.map((f) => {
        const start = new Date(nextHourMs + f.hoursAfterNextHour * HOUR_MS);
        const end = new Date(start.getTime() + SESSION_DURATION_MS);
        return (
          <NextSessionCard
            key={`${f.gamer}-${f.name}`}
            gamerFirstName={f.gamer}
            productName={f.name}
            nextSessionStart={start}
            nextSessionEnd={end}
            voiceIsOpen={f.voiceIsOpen}
            voiceHref="#"
            reportsHref="#"
          />
        );
      })}
    </div>
  );
}
