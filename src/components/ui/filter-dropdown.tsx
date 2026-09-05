"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One row of a filter control.
 *
 * The value is parameterised so a caller whose vocabulary is a literal union —
 * a generated enum, typically — keeps that type across the control instead of
 * widening to `string` on the way in and needing an assertion on the way back
 * out. A caller filtering on ids or stringified numbers infers `string` and
 * reads exactly as it did before.
 */
export interface FilterDropdownOption<T extends string = string> {
  value: T;
  label: string;
  /** Optional leading visual (e.g. a language flag). Rendered in both the
   *  trigger when selected and the option row. */
  adornment?: ReactNode;
}

interface FilterDropdownProps<T extends string> {
  /** Field label rendered above the control. */
  label: string;
  /** Muted text shown when nothing is selected — i.e. the unfiltered "all"
   *  state. There is no "all" row in the list; clearing is done with the X. */
  allLabel: string;
  options: FilterDropdownOption<T>[];
  /** Selected option value, or `null` for the "all" state. */
  value: T | null;
  onChange: (value: T | null) => void;
}

// Single-select dropdown for short, fixed option sets (day, language) — a
// trigger button that opens a list. For long, type-to-filter sets (educator,
// municipality) use <FilterCombobox> instead. Like the combobox, "all" is the
// absence of a selection: no value shows `allLabel` as muted placeholder text,
// and a clear (X) button resets a selection back to it. Closes on outside
// click / Escape.
export function FilterDropdown<T extends string>({
  label,
  allLabel,
  options,
  value,
  onChange,
}: FilterDropdownProps<T>) {
  const c = useTranslations("common");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target;
      if (target instanceof Node && !containerRef.current?.contains(target)) {
        close();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  function select(next: T | null) {
    onChange(next);
    close();
  }

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => (open ? close() : setOpen(true))}
          className="flex h-10 w-full items-center gap-2 rounded-md border border-border bg-background py-2 pl-3 pr-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {selected?.adornment}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-left",
              !selected && "text-muted-foreground",
            )}
          >
            {selected ? selected.label : allLabel}
          </span>
        </button>
        {/* This overlay is pointer-events-none so clicking the chevron (or its
            padding) falls through to the trigger button and opens the list; only
            the clear button re-enables pointer events. */}
        <span className="pointer-events-none absolute right-0 top-0 flex h-10 items-center pr-1">
          {value !== null ? (
            <button
              type="button"
              aria-label={c("clear")}
              onClick={() => select(null)}
              className="pointer-events-auto rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <ChevronDown className="mr-2 h-4 w-4 text-muted-foreground" />
          )}
        </span>

        {open && (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-card p-1 text-foreground shadow-md"
          >
            {options.map((o) => (
              <li key={o.value}>
                <OptionButton
                  active={o.value === value}
                  label={o.label}
                  adornment={o.adornment}
                  onClick={() => select(o.value)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function OptionButton({
  active,
  label,
  adornment,
  onClick,
}: {
  active: boolean;
  label: string;
  adornment?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-foreground",
        active && "bg-accent/60",
      )}
    >
      {adornment}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}
