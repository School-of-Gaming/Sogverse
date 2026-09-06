"use client";

import { cn } from "@/lib/utils";

/**
 * The "privacy screen" — a *subtle* frosting over a locked zone's
 * member area for outsiders. Deliberately light: you can still read who's in
 * there. It conceals nothing (the real privacy is SFU `canReceive`) — it's just
 * UI grammar signalling "this is private". The "Private" label itself lives in
 * the zone card header (see ZoneCard), so this is purely the tint. Insiders see
 * no screen.
 *
 * **Not glass, and not the scrim.** Those two are the only constructs in this
 * app that composite, and this is neither: it lays down no colour at all, so
 * there is nothing to see through. It is a blur used as a signal — the members
 * stay readable through it, which is the whole design — where glass is an
 * opaque-enough surface carrying its own contents and the scrim is a black tint
 * that takes the light out of what it covers. Either one here would hide the
 * people it is meant to leave visible. It has no library home yet; until it
 * does, the arbitrary blur stays and is not swept into `glass`.
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
