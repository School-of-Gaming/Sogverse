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
 * lights to `act` and reveals a lucide check when checked.
 *
 * Controlled only — every call site passes `checked` — so the check glyph is
 * rendered from the `checked` prop rather than a `peer-checked:` descendant
 * selector (the general-sibling combinator can't reach a nested icon). The box
 * border/fill and focus ring still derive from `peer-*` on the input.
 *
 * `className` lands on the wrapper for positioning (`mt-0.5`, `mt-1`, …); the
 * 1rem box size is fixed so checkboxes stay uniform across the app.
 *
 * **The unchecked box is outlined in the quiet ink, not in the edge token, and
 * that is what keeps it alive on a hovered row.** `border` is `#333333`: against
 * a card it reads 1.38:1, and against the hover layer composited over that card
 * (`#2B2B2B`) it reads 1.12:1 — an outline nobody can see, which is what the
 * whole box becomes on the one row a pointer is actually over.
 * `muted-foreground` is `#A6A6A6`, reading 7.1:1 at rest and 5.8:1 under the
 * hover layer, so the outline survives the lift on every ground a row can sit
 * on — the page, a card or a lifted panel — without the box needing to know
 * which one it is. A ground of its own would have been the other fix and is
 * worse here: the box sits *inside* the row's click target, so it should lift
 * with the row rather than punch an unlit hole through it.
 *
 * The checked box takes the act edge with its act fill, so the amber reads at
 * the full 1rem instead of inside a dark hairline; disabled keeps the same
 * outline at half strength on the row's resting ground (≈2.6:1 on lifted) and
 * never meets the hover layer, because a disabled row does not take one.
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
          className="peer absolute inset-0 z-10 m-0 opacity-0"
          {...props}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none flex h-4 w-4 items-center justify-center rounded-sm border border-muted-foreground bg-transparent transition-colors peer-checked:border-act peer-checked:bg-act peer-focus-visible:ring-2 peer-focus-visible:ring-act peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-disabled:opacity-50"
        >
          {checked && (
            <Check
              className="h-3 w-3 text-act-foreground"
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
