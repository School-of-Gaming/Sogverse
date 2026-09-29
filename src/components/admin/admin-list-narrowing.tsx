"use client";

import { useId } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * The two pieces every admin list that narrows client-side is built from: the
 * labelled search box, and the line under the controls saying how many of how
 * many rows are showing, with a way back to all of them. The product lists and
 * Library content both render these, so a search box or a count line cannot
 * drift between them.
 */

/**
 * A labelled search field with its glass inside the box. The filter controls
 * that may sit beside it label themselves the same way, in the same size and
 * colour; this one is a real `<label>`, because it has a single input to name.
 */
export function AdminListSearchField({
  label,
  placeholder,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
  /** Where a URL-mirrored search settles its mirror — see the product list. */
  onBlur?: () => void;
}) {
  const id = useId();

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={id}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>
    </div>
  );
}

/**
 * "Showing N of M", and a Clear at the far end of the same line while anything
 * is narrowing the list.
 */
export function AdminListShowingLine({
  showing,
  clearLabel,
  narrowed,
  onClear,
}: {
  /** The already-formatted count sentence. */
  showing: string;
  clearLabel: string;
  /** True while anything — the search box or a filter — is narrowing the list. */
  narrowed: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span className="tabular-nums">{showing}</span>
      {/* No vertical padding: with py-1 the button is taller than the bare
          text, so toggling it in/out grows the row and shifts the rows below.
          Its height matches the count span's line-height. It is the last child
          of a justify-between row, so its arrival moves nothing already there. */}
      {narrowed && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-md px-2 transition-colors hover:text-foreground"
        >
          <X className="h-3 w-3" />
          {clearLabel}
        </button>
      )}
    </div>
  );
}
