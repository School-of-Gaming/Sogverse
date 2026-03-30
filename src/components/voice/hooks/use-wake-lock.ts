import { useEffect, useRef } from "react";

/**
 * Requests a Screen Wake Lock for the lifetime of the component, preventing
 * screens from dimming during a voice call. Re-acquires automatically after
 * the page returns from a background tab (the browser releases wake locks on
 * visibility change).
 */
export function useWakeLock() {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    // Not all browsers support the Wake Lock API — degrade silently.
    if (!("wakeLock" in navigator)) return;

    let released = false;

    const acquire = async () => {
      if (released) return;
      try {
        sentinelRef.current = await navigator.wakeLock.request("screen");
        sentinelRef.current.addEventListener("release", () => {
          sentinelRef.current = null;
        });
      } catch {
        // Permission denied or low-battery — nothing we can do.
      }
    };

    // Re-acquire when the tab becomes visible again (browsers auto-release
    // wake locks when the page is hidden).
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !released) {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
    };
  }, []);
}
