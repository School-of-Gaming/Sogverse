"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * **A short word with more behind it** — a statement's short name with the
 * sentence the gamer read, a share with the platform's figure. The more opens
 * on hover and on keyboard focus, and is the word's accessible description.
 *
 * The hint sits inside the wrapper, flush against the word with its spacing
 * drawn as padding, so the pointer can move onto the hint without leaving what
 * opened it. Escape hides it while the wrapper is hovered or focused, without
 * moving either; leaving the wrapper, or focus leaving it, lets it open again.
 */
export function FeedbackHint({
  children,
  hint,
  alignEnd = false,
  block = false,
  className,
}: {
  /** The word, read in place. */
  children: ReactNode;
  /** What opens from it. */
  hint: ReactNode;
  /** Open leftward from the word's end, for a word near the right of its card. */
  alignEnd?: boolean;
  /** Take the whole width of the cell, so all of it opens the hint. */
  block?: boolean;
  /** The word's own type: its size, weight and ink. */
  className?: string;
}) {
  const hintId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // While the hint can be showing, Escape hides it wherever focus is: a reader
  // pointing at the word has not necessarily focused it.
  const engaged = hovered || focused;
  useEffect(() => {
    if (!engaged) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDismissed(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [engaged]);

  return (
    <span
      className={cn("group relative", block ? "block" : "inline-block")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setDismissed(false);
      }}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setFocused(false);
        setDismissed(false);
      }}
    >
      <span
        tabIndex={0}
        aria-describedby={hintId}
        className={cn(
          "cursor-help rounded-xs underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-act",
          className,
        )}
      >
        {children}
      </span>
      <span
        className={cn(
          "invisible absolute top-full z-20 w-max max-w-56 pt-1.5",
          !dismissed && "group-hover:visible group-focus-within:visible",
          alignEnd ? "right-0" : "left-0",
        )}
      >
        <span
          id={hintId}
          role="tooltip"
          className="block rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-xs font-normal text-foreground shadow-md"
        >
          {hint}
        </span>
      </span>
    </span>
  );
}
