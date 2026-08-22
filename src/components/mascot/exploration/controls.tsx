"use client";

import type { ReactElement, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type Choice<T extends string> = { id: T; label: string };

/**
 * One row of mutually exclusive chips. Deliberately not a `<select>`: the
 * whole point of a playground is seeing every option at once and being one
 * click from any of them.
 */
export function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly Choice<T>[];
  value: T;
  onChange: (next: T) => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
      <span className="w-20 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-1 flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs transition-colors",
              option.id === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A labelled tile with a caption under it — the unit the whole gallery is built from. */
export function Tile({
  caption,
  sub,
  tone = "card",
  children,
}: {
  caption: string;
  sub?: string;
  tone?: "card" | "paper";
  children: ReactNode;
}): ReactElement {
  return (
    <figure className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          "flex items-end justify-center rounded-lg border border-border",
          tone === "card" ? "bg-background" : "bg-muted",
        )}
      >
        {children}
      </div>
      <figcaption className="text-center text-[11px] leading-tight text-muted-foreground">
        {caption}
        {sub !== undefined && <span className="block text-[10px] opacity-70">{sub}</span>}
      </figcaption>
    </figure>
  );
}

/** A section heading inside a concept card. */
export function Rubric({ title, note }: { title: string; note?: string }): ReactElement {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">{title}</h4>
      {note !== undefined && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
