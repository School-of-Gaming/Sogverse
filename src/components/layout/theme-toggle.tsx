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
  const isDark = theme === "dark";

  function switchTo(newTheme: "light" | "dark") {
    if (newTheme === theme) return;

    // startViewTransition is not in all TS lib typings yet
    const startViewTransition = (document as unknown as { startViewTransition?: (cb: () => void) => void }).startViewTransition;

    if (!startViewTransition) {
      setTheme(newTheme);
      return;
    }

    startViewTransition.call(document, () => {
      flushSync(() => {
        setTheme(newTheme);
      });
    });
  }

  return (
    <button
      onClick={mounted ? () => switchTo(isDark ? "light" : "dark") : undefined}
      className={cn(
        "flex gap-0.5 rounded-full border border-border bg-muted/50 p-0.5",
        className,
      )}
      role="switch"
      aria-checked={mounted ? isDark : undefined}
      aria-label="Toggle theme"
    >
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-200",
          mounted && !isDark ? "bg-primary text-primary-foreground" : "text-muted-foreground",
        )}
      >
        <Sun className="h-3.5 w-3.5" />
      </span>
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-200",
          mounted && isDark ? "bg-primary text-primary-foreground" : "text-muted-foreground",
        )}
      >
        <Moon className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
