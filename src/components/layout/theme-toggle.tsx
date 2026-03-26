"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  // Avoid hydration mismatch — next-themes resolves on client only
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    // Render a placeholder the same size to prevent layout shift
    return <div className={cn("h-8 w-8", className)} />;
  }

  const isDark = theme === "dark";

  function toggleTheme() {
    const newTheme = isDark ? "light" : "dark";

    // Fallback for browsers without View Transitions API
    if (!document.startViewTransition) {
      setTheme(newTheme);
      return;
    }

    // The API screenshots the current state, applies the DOM change
    // synchronously via flushSync, then crossfades to the new state
    // as a single GPU-composited animation — no per-element transitions.
    document.startViewTransition(() => {
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
