import { useSyncExternalStore } from "react";

/** Tailwind's `lg`, which is where the room turns from the phone layout to the desktop one. */
const DESKTOP_QUERY = "(min-width: 64rem)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const isDesktopNow = () => window.matchMedia(DESKTOP_QUERY).matches;
const notKnownYet = () => null;

/**
 * Which of the room's two layouts this screen gets, or `null` while that cannot
 * be known.
 *
 * **Decided in script rather than with CSS, because exactly one layout may
 * exist.** Two layouts toggled by `hidden lg:flex` would both mount, which is
 * two `<video>` elements per person and two copies of the chat. A server does
 * not know the screen, so a server render and the hydration render read `null`
 * and draw only the empty ground, and React swaps in the right layout straight
 * after hydrating. Nothing is drawn wrongly and then corrected, which is what
 * keeps it free of a layout flash. A room mounted on the client, as a live room
 * is once its token arrives, knows on its first render.
 */
export function useIsDesktopStage(): boolean | null {
  return useSyncExternalStore(subscribe, isDesktopNow, notKnownYet);
}
