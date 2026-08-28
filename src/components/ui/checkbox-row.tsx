"use client";

import * as React from "react";
import { cva } from "class-variance-authority";
import { badgeVariants } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * The row's container classes, by size and state. Only the container is
 * described here — the box, the sentence column, the chip and the trailing slot
 * are fixed geometry, because a caller free to re-space them is a caller free to
 * re-invent the composition this component exists to stop being re-invented.
 */
const checkboxRowVariants = cva(
  "flex items-start gap-3 rounded-md border p-3 transition-colors",
  {
    variants: {
      size: {
        sm: "text-sm",
        xs: "text-xs",
      },
      checked: {
        true: "border-primary bg-primary/5",
        false: "border-input",
      },
      disabled: {
        true: "cursor-not-allowed opacity-60",
        false: "cursor-pointer",
      },
    },
    compoundVariants: [
      // The hover fill is the border's promise being kept — it lights the same
      // area the click will act on. A ticked row already carries its own fill
      // and a disabled one is not a target, so neither takes it.
      { checked: false, disabled: false, class: "hover:bg-accent/50" },
    ],
    defaultVariants: { size: "sm", checked: false, disabled: false },
  },
);

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
   * **This is the only thing that ever says which kind of question a row is.**
   * The border says the row is clickable and nothing more, so a surface holding
   * both a condition and an ask distinguishes them in words here, never by
   * styling one of them lighter. A word also survives being read by someone who
   * cannot see the row at all, which no amount of border treatment does.
   *
   * A row that has nothing to contrast with takes no chip: on a page with one
   * consent on it, "Optional" is answering a question nobody asked.
   *
   * The component owns the chip's look and the caller supplies only the word —
   * a node, so it is always a translated string. It is the app's outline badge,
   * deliberately muted and never primary-filled: a chip that competed with the
   * checkbox for attention would be answering the row's question for the reader.
   *
   * Right-packed like `trailing`, though nothing about it arrives late: it is
   * settled at first paint, so it moves nothing and only has to stay out of the
   * sentence's way.
   */
  tag?: React.ReactNode;
  /**
   * The two text scales the app uses: `sm` for a full-width form (the
   * registration card, the admin product form), `xs` for the product panel's
   * rail, where the row shares a 20rem column with everything else in a signup
   * form.
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
   * Margins only — the row's own spacing, border, padding and text size are the
   * component's, and a caller painting over them is re-opening the drift this
   * replaced.
   */
  className?: string;
}

/**
 * **A checkbox and the sentence it belongs to, as one clickable row.**
 *
 * The app has one checkbox *primitive* and had as many compositions around it
 * as there were surfaces asking a question — a registration form, a signup
 * panel, an admin product form — each hand-assembling the same label, gap, hint
 * indent and `mt-0.5` from memory, and each drifting from the others by a gap
 * unit here and a hover treatment there. This is that composition, once. **New
 * consent-shaped surfaces reach for this rather than assembling their own.**
 *
 * **Its scope is a question asked on its own, not a checkbox inside a form.**
 * The settings page's marketing preferences are plain checkboxes in a fieldset,
 * because inside a form of bare fields a pair of bordered rows would be the only
 * boxed controls on the page: there the form's idiom wins. This is for the
 * standalone ask — a consent in a signup panel, an opt-in under a registration
 * form, a condition an admin attaches to a product.
 *
 * **There is one shape, and it is bordered, because the border is what says
 * where you may click.** A checkbox glyph is 16px square; the sentence beside it
 * is not obviously part of the same target, and a bare row leaves a reader
 * guessing whether they have to hit the little box. The border draws the target,
 * and then the whole row really is one — the box, the sentence, the hint, the
 * chip and the trailing slot all toggle it, because the row is a `<label>` and
 * the browser gives that for free. On a phone, where the glyph is well under the
 * comfortable touch minimum and the row is comfortably over it, this is the
 * difference between a control that works and one that is missed twice before it
 * is hit.
 *
 * **So the border is not a weight, and must never be spent as one.** An earlier
 * draft had a quiet unbordered variant for optional asks and the bordered one
 * for required gates; that made the affordance mean two things at once, and the
 * quiet rows read as the loud ones failing to render. Required and optional look
 * identical here on purpose, and the difference between them is carried in words
 * by `tag` — which is legible to a reader who cannot see the row, as a border
 * never was.
 *
 * The input's accessible name comes from `aria-labelledby` pointing at the
 * sentence rather than from the label's text content, because the content also
 * holds the chip, the hint and whatever `trailing` carries — without it, a
 * screen reader would read the hint twice, once as part of the name and again as
 * the description.
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
          checkboxRowVariants({ size, checked, disabled }),
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
            <span
              id={hintId}
              className="mt-1 block text-xs text-muted-foreground"
            >
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
