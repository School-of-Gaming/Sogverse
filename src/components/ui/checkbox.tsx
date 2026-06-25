import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type CheckboxProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
>;

/**
 * Themed checkbox primitive. A visually-hidden native `<input type="checkbox">`
 * (keeps keyboard/focus/label behavior for free) overlays a styled box that
 * lights to `primary` and reveals a lucide check when checked.
 *
 * Controlled only — every call site passes `checked` — so the check glyph is
 * rendered from the `checked` prop rather than a `peer-checked:` descendant
 * selector (the general-sibling combinator can't reach a nested icon). The box
 * border/fill and focus ring still derive from `peer-*` on the input.
 *
 * `className` lands on the wrapper for positioning (`mt-0.5`, `mt-1`, …); the
 * 1rem box size is fixed so checkboxes stay uniform across the app.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, ...props }, ref) => {
    return (
      <span
        className={cn("relative inline-flex h-4 w-4 shrink-0", className)}
      >
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...props}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none flex h-4 w-4 items-center justify-center rounded-sm border border-input bg-transparent transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-disabled:opacity-50"
        >
          {checked && (
            <Check
              className="h-3 w-3 text-primary-foreground"
              strokeWidth={3}
            />
          )}
        </span>
      </span>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
