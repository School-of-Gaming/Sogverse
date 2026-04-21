"use client";
import { useSyncExternalStore } from "react";

// Module-scoped ticking clock: a single interval updates `currentTime` and
// notifies all subscribers via useSyncExternalStore. Server snapshot is null
// so SSR and the first client render match; after hydration components see
// the live tick.
let currentTime: number | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  currentTime = Date.now();
  setInterval(() => {
    currentTime = Date.now();
    for (const l of listeners) l();
  }, 1000);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): number | null {
  return currentTime;
}

function getServerSnapshot(): number | null {
  return null;
}

export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
