"use client";

import { cn } from "@/lib/utils";

/**
 * The "privacy screen" — a *subtle* frosted-glass tint over a locked zone's
 * member area for outsiders. Deliberately light: you can still read who's in
 * there. It conceals nothing (the real privacy is SFU `canReceive`) — it's just
 * UI grammar signalling "this is private". The "Private" label itself lives in
 * the zone card header (see ZoneCard), so this is purely the tint. Insiders see
 * no screen.
 */
export function PrivacyScreen({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-10 rounded-lg backdrop-blur-[1.5px]",
        className,
      )}
    />
  );
}
