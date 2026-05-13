"use client";

import { useEffect, useState } from "react";
import { SessionsSectionLoaded, SessionsSectionLoading } from "./SessionsSection";

// Hardcoded fixtures so the parent Sessions section renders something
// real while the adapter for `MyParticipationRow → NextSessionCardProps`
// is in flight. Remove this debug surface once the adapter lands.
//
// Sessions are sorted ascending by start time — the live one (started in
// the last hour) sits on top, the rest fan out across the next ~11 days
// at 16:00 local. Future starts anchor to a midnight-tomorrow boundary
// so the demo always shows round-hour windows ("16:00 – 18:00") rather
// than "16:23 – 18:23".
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const SESSION_DURATION_MS = 2 * HOUR_MS;
const FUTURE_HOUR_OF_DAY = 16;
const LIVE_STARTED_MINUTES_AGO_MS = 30 * 60 * 1000;

const FIXTURES = [
  { gamer: "Bobby", name: "Cosmic Builders Camp", live: true },
  { gamer: "Alex", name: "Minecraft Survival Camp", daysAhead: 2 },
  { gamer: "Sam", name: "Lego Robotics Camp", daysAhead: 4 },
  { gamer: "Mei", name: "Pixel Art Camp", daysAhead: 7 },
  { gamer: "Riya", name: "Speedrun Academy Camp", daysAhead: 9 },
  { gamer: "Noah", name: "Rocket League Club", daysAhead: 11 },
] as const;

export function NextSessionCardsDebug() {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical post-hydration flag so SSR and client render match
  useEffect(() => setMounted(true), []);

  if (!mounted) return <SessionsSectionLoading />;

  const now = new Date().getTime();
  const midnightTomorrow = new Date();
  midnightTomorrow.setHours(24, 0, 0, 0);
  const midnightTomorrowMs = midnightTomorrow.getTime();

  const sessions = FIXTURES.map((f) => {
    if ("live" in f) {
      const start = new Date(now - LIVE_STARTED_MINUTES_AGO_MS);
      const end = new Date(start.getTime() + SESSION_DURATION_MS);
      return {
        gamerFirstName: f.gamer,
        productName: f.name,
        nextSessionStart: start,
        nextSessionEnd: end,
        voiceIsOpen: true,
        voiceHref: "#",
        reportsHref: "#",
      };
    }
    const start = new Date(
      midnightTomorrowMs + (f.daysAhead - 1) * DAY_MS + FUTURE_HOUR_OF_DAY * HOUR_MS,
    );
    const end = new Date(start.getTime() + SESSION_DURATION_MS);
    return {
      gamerFirstName: f.gamer,
      productName: f.name,
      nextSessionStart: start,
      nextSessionEnd: end,
      voiceIsOpen: false,
      voiceHref: "#",
      reportsHref: "#",
    };
  });

  return <SessionsSectionLoaded sessions={sessions} />;
}
