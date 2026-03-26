"use client";

import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

// useSyncExternalStore avoids the setState-in-effect lint error for mount detection.
// Server snapshot returns false, client snapshot returns true — no effect needed.
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!mounted) {
    // Render a placeholder the same size to prevent layout shift
    return <div className={cn("h-8 w-8", className)} />;
  }

  const isDark = theme === "dark";

  function toggleTheme() {
    const newTheme = isDark ? "light" : "dark";

    // startViewTransition is not in all TS lib typings yet
    const startViewTransition = (document as unknown as { startViewTransition?: (cb: () => void) => void }).startViewTransition;

    // Fallback for browsers without View Transitions API
    if (!startViewTransition) {
      setTheme(newTheme);
      return;
    }

    // The API screenshots the current state, applies the DOM change
    // synchronously via flushSync, then crossfades to the new state
    // as a single GPU-composited animation — no per-element transitions.
    startViewTransition.call(document, () => {
      flushSync(() => {
        setTheme(newTheme);
      });
    });
  }

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "flex items-center justify-center rounded-md border border-border bg-muted/50 p-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
