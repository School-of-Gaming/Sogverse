/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a control label on a page no user will ever see and that gets deleted with the exploration */
"use client";

import { useState, type ReactElement, type ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { ConceptId } from "../concept";

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

/**
 * A section that does not render its contents until it is opened, and whose
 * starting state is the caller's decision.
 *
 * The children sit behind a conditional rather than behind `hidden`, so a
 * closed section costs one button and nothing else — which is why this exists
 * at all. Whether that saving is worth taking is a different question from
 * whether the control works, and it is not this component's to answer:
 * Kyle's ruling on the deep dives is that a collapsed section is a section
 * the reader skips and never learns was there, so they open expanded and the
 * page is long. Anything genuinely secondary passes nothing and starts shut.
 */
export function Collapsible({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
        }}
        className="flex w-full items-baseline gap-3 px-5 py-4 text-left transition-colors hover:bg-accent/40"
      >
        <span className="text-lg font-semibold text-foreground">{title}</span>
        {subtitle !== undefined && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        <span className="ml-auto text-xs uppercase tracking-wide text-primary">
          {open ? "Close" : "Open"}
        </span>
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </div>
  );
}

/**
 * The species a study offers when it needs one picked.
 *
 * Deliberately the round-one and round-two base models rather than every
 * concept in the registry: a study that exists to compare two *renderings* —
 * a face grammar, an arm, a season — is asking one question of a stable set,
 * and growing that set with every new species turns a comparison into a
 * catalogue. The newer species each have a section of their own instead.
 */
export const STUDY_SPECIES: Choice<ConceptId>[] = [
  { id: "kaveri", label: "Kaveri" },
  { id: "otso", label: "Otso" },
  { id: "taitto", label: "Taitto" },
  { id: "kaari", label: "Kaari" },
  { id: "kide", label: "Kide" },
  { id: "nappi", label: "Nappi" },
  { id: "ytymo", label: "Ytymo" },
  { id: "konsu", label: "Konsu" },
];

/** The card one study renders into: a heading, its lede, and the pictures. */
export function Panel({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: ReactElement | ReactElement[];
}): ReactElement {
  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-foreground">{title}</h3>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">{lede}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
