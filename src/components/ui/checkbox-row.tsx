"use client";

import * as React from "react";
import { cva } from "class-variance-authority";
import { badgeVariants } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * The row's classes, by variant, size and lit state. Only the container is
 * described here — the box, the sentence column and the trailing slot are fixed
 * geometry, because a caller free to re-space them is a caller free to
 * re-invent the composition this component exists to stop being re-invented.
 */
const checkboxRowVariants = cva("flex items-start transition-colors", {
  variants: {
    variant: {
      plain: "gap-2",
      boxed: "gap-3 rounded-md border p-3",
    },
    size: {
      sm: "text-sm",
      xs: "text-xs",
    },
    checked: { true: "", false: "" },
    disabled: {
      true: "cursor-not-allowed opacity-60",
      false: "cursor-pointer",
    },
  },
  compoundVariants: [
    // The lit border is the whole point of the boxed variant, and it exists
    // only there: a plain row that changed colour when ticked would be
    // borrowing the weight the gate spends its border on.
    { variant: "boxed", checked: true, class: "border-primary bg-primary/5" },
    { variant: "boxed", checked: false, class: "border-input" },
    {
      variant: "boxed",
      checked: false,
      disabled: false,
      class: "hover:bg-accent/50",
    },
  ],
  defaultVariants: { variant: "plain", size: "sm", checked: false, disabled: false },
});

export interface CheckboxRowProps {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  /**
   * The sentence beside the box — a node rather than a string, because these
   * sentences carry their own links inline (`t.rich(...)` output naming a
   * partner, a policy, a document) and because a row whose label is a bold
   * title over a couple of detail lines is the same composition with a richer
   * node in this slot, not a second component.
   *
   * A click landing on a link inside it reads instead of ticking, which is the
   * DOM's own doing: a `<label>`'s activation behaviour is skipped when the
   * click lands on an interactive descendant. Nothing here listens for clicks,
   * so there is nothing for an anchor to stop propagating away from.
   */
  label: React.ReactNode;
  /**
   * A muted sub-line under the sentence — what the tick means, or where the
   * answer can be changed later. It sits in the sentence's own column, so it
   * aligns with the label text rather than with the box, and it is wired to the
   * input with `aria-describedby`: a hint rendered as loose text is not
   * announced at all.
   */
  hint?: React.ReactNode;
  /**
   * A word parked at the end of the row's first line, in a muted chip —
   * "Required", "Optional".
   *
   * **This is how a surface holding both kinds of row tells them apart.** The
   * two variants below are a difference in *weight*, and a list that alternated
   * between them would read as a rendering fault rather than as a distinction;
   * so a surface that must show required and optional rows together renders
   * every one of them `boxed` and says which is which in words here. A worded
   * chip also survives being read by someone who cannot see the border at all,
   * which no amount of variant styling does.
   *
   * The component owns the chip's look and the caller supplies only the word —
   * a node, so it can be a translated string. It is the app's outline badge,
   * deliberately muted and never primary-filled: a label that competed with the
   * checkbox for attention would be answering the row's question for the reader.
   *
   * Right-packed for the same reason `trailing` is, though nothing about it
   * arrives late: it is settled at first paint, so it moves nothing and only
   * has to stay out of the sentence's way.
   */
  tag?: React.ReactNode;
  /**
   * Quiet row, or gate. See the component note — this is a required prop
   * because it is a decision about what the row *is*, and a default would let
   * it be made by not making it.
   */
  variant: "plain" | "boxed";
  /**
   * The two text scales the app actually uses: `sm` for a form or a settings
   * card, `xs` for the product panel's rail, where the row shares a 20rem
   * column with everything else in a signup form.
   */
  size?: "sm" | "xs";
  /**
   * An optional status at the end of the row — a spinner, a "Saved" check.
   *
   * **Right-packed, and that is load-bearing rather than cosmetic.** This slot
   * holds the one thing in the row that can arrive after first paint, and the
   * end of the row is where the layout's slack already sits: a status appearing
   * there grows the group leftward into that slack, so the box, the sentence
   * and the hint all hold their position to the pixel. Put the same node before
   * the sentence and its arrival would shove every word in the row sideways —
   * exactly the shift the layout rule forbids. **The order is therefore part of
   * the contract**: a later tidy-up that moves this slot on aesthetic grounds
   * reintroduces the shift silently, and will look like an improvement.
   */
  trailing?: React.ReactNode;
  /**
   * Margins only — the row's own spacing is the component's. A caller reaching
   * for padding, borders or text size here wants a variant instead, and should
   * say so rather than paint over one.
   */
  className?: string;
}

/**
 * **A checkbox and the sentence it belongs to, as one clickable row.**
 *
 * The app has one checkbox *primitive* and had as many compositions around it
 * as there were surfaces asking a question — a registration form, a settings
 * card, a signup panel, an admin form — each hand-assembling the same label,
 * gap, hint indent and `mt-0.5` from memory, and each drifting from the others
 * by a gap unit here and a hover treatment there. This is that composition,
 * once. **New checkbox-with-a-sentence surfaces reach for this rather than
 * assembling their own.**
 *
 * **Two variants, because there are two kinds of question and they must not
 * look alike.** `plain` is the optional ask — a mailing list offered on the way
 * past, a preference in a settings card — a quiet line whose whole weight is
 * its sentence. `boxed` is the required gate: a bordered container that lights
 * to `primary` when ticked, which is what gives a legal agreement the visible
 * weight of the thing standing between a reader and the button. Flattening the
 * two into one look would go wrong in both directions at once — a marketing
 * opt-in wearing a gate's border reads as something a parent has to accept to
 * proceed, and a required consent rendered as a quiet line reads as fine print
 * to be scrolled past. So `variant` is required and has no default.
 *
 * **But the variant is chosen per surface, not per row.** Two weights standing
 * side by side in one list read as a UI clash rather than as a distinction — the
 * lighter rows look like the heavier ones failed to render. So a surface where
 * every row is optional (a registration form, a settings card) is `plain`
 * throughout, and a surface that has to show required and optional rows together
 * is `boxed` throughout and says which is which in words, with `tag`. The
 * variant carries the weight of the surface; the chip carries the difference
 * inside it.
 *
 * **The whole row is the click target.** It is a `<label>`, so the box, the
 * sentence, the hint and the trailing slot all toggle it, and the browser gives
 * that for free. The input's accessible name comes from `aria-labelledby`
 * pointing at the sentence rather than from the label's text content, because
 * the content also holds the hint and whatever `trailing` carries — without it,
 * a screen reader would read the hint twice, once as part of the name and again
 * as the description.
 *
 * The box pins to the first line of a wrapping sentence (`mt-0.5`) rather than
 * centring on the whole block, which is what keeps a three-line consent from
 * putting its checkbox halfway down the paragraph.
 */
const CheckboxRow = React.forwardRef<HTMLInputElement, CheckboxRowProps>(
  (
    {
      checked,
      onCheckedChange,
      disabled = false,
      label,
      hint,
      tag,
      variant,
      size = "sm",
      trailing,
      className,
    },
    ref,
  ) => {
    // Generated, never a module constant: a row is rendered per consent, per
    // partner, per document — a literal id would collide the moment a surface
    // renders two of them, and `aria-describedby` would point at whichever one
    // the DOM happened to hold.
    const generated = React.useId();
    const labelId = `${generated}-label`;
    const hintId = hint === undefined ? undefined : `${generated}-hint`;

    return (
      <label
        className={cn(
          checkboxRowVariants({ variant, size, checked, disabled }),
          className,
        )}
      >
        <Checkbox
          ref={ref}
          className="mt-0.5"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          disabled={disabled}
          aria-labelledby={labelId}
          aria-describedby={hintId}
        />
        {/* `min-w-0` so a long word or a truncating title inside the label can
            actually shrink; `flex-1` so the slack the trailing slot grows into
            lives here, at the end of the row, rather than between the box and
            the sentence. */}
        <span className="min-w-0 flex-1">
          {/* The sentence and its chip share one line; `items-start` keeps the
              chip on the first of them however far the sentence wraps, and
              `flex-1` on the sentence is what leaves the chip the slack at the
              end to sit in. */}
          <span className="flex items-start gap-3">
            <span id={labelId} className="min-w-0 flex-1">
              {label}
            </span>
            {tag !== undefined && (
              <span
                className={cn(
                  badgeVariants({ variant: "outline" }),
                  "shrink-0 border-border text-muted-foreground",
                )}
              >
                {tag}
              </span>
            )}
          </span>
          {hint !== undefined && (
            <span id={hintId} className="mt-1 block text-xs text-muted-foreground">
              {hint}
            </span>
          )}
        </span>
        {trailing !== undefined && (
          <span className="ml-3 shrink-0 self-start">{trailing}</span>
        )}
      </label>
    );
  },
);
CheckboxRow.displayName = "CheckboxRow";

export { CheckboxRow, checkboxRowVariants };
