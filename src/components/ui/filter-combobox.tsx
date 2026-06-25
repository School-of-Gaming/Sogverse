"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { OptionButton, type FilterDropdownOption } from "./filter-dropdown";

interface FilterComboboxProps {
  /** Field label rendered above the control. */
  label: string;
  /** Placeholder shown when nothing is selected (the unfiltered "all" state). */
  placeholder?: string;
  options: FilterDropdownOption[];
  /** Selected option value, or `null` for the "all" state. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Empty-results copy shown while typing. */
  noResultsLabel?: string;
}

// A combobox (a.k.a. autocomplete / typeahead): a text input the user types
// into directly, with the option list filtering live as they type. For the
// admin club filters' educator/municipality fields, where the option set is
// too long to scan. Short fixed sets (day, language) use <FilterDropdown>.
//
// The input shows the selected option's label while closed; focusing clears
// the text so the user can type a fresh query and see all options, and blurring
// without a pick restores the selection (the controlled value flips back to the
// selected label). Closes on outside click / Escape.
export function FilterCombobox({
  label,
  placeholder,
  options,
  value,
  onChange,
  noResultsLabel,
}: FilterComboboxProps) {
  const c = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? "",
    [options, value],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target;
      if (target instanceof Node && !containerRef.current?.contains(target)) {
        close();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
        inputRef.current?.blur();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function select(next: string | null) {
    onChange(next);
    close();
    inputRef.current?.blur();
  }

  // While open the input reflects the live query; while closed it shows the
  // current selection (or the placeholder when nothing is selected).
  const inputValue = open ? query : selectedLabel;

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div ref={containerRef} className="relative">
        <Input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={placeholder}
          value={inputValue}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          className="pr-9 focus-visible:ring-border"
        />
        <span className="pointer-events-none absolute right-0 top-0 flex h-10 items-center pr-1">
          {value !== null ? (
            <button
              type="button"
              aria-label={c("clear")}
              // pointer-events re-enabled here so the clear button is clickable
              // inside the otherwise pass-through adornment slot.
              className="pointer-events-auto rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground"
              onMouseDown={(e) => {
                // Prevent the input blur so the click lands before close.
                e.preventDefault();
                select(null);
              }}
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
            className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-input bg-popover p-1 text-popover-foreground shadow-md"
          >
            {filtered.map((o) => (
              <li key={o.value}>
                <OptionButton
                  active={o.value === value}
                  label={o.label}
                  adornment={o.adornment}
                  onClick={() => select(o.value)}
                />
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-2 py-6 text-center text-sm text-muted-foreground">
                {noResultsLabel}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
