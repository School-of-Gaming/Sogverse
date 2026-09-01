import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * The button recipe.
 *
 * **Type.** The base carries the brand's CTA type — Poppins 16px / SemiBold 600
 * (Guidebook A.3) — so every button in the product wears it without asking. The
 * `sm` size deliberately keeps its own `text-xs`: it is the dense variant used in
 * toolbars, table rows and card footers, and the CTA type governs CTAs, not the
 * compact affordances beside them. Raising `sm` to 16px would widen ~60 call
 * sites and overflow the longest locale of a `whitespace-nowrap` label at the
 * 360px mobile floor (the voice button's "Ouvre le {date} à {time}" is the
 * binding case), which is a layout change nobody asked this pass to make.
 *
 * **Hover is not a colour.** A fill never darkens or lightens on hover: shading a
 * brand colour past its authored value stops it being that colour, and hover is
 * an affordance mobile-first families never see anyway. Filled variants therefore
 * take a 2px ring instead — geometry-free (a ring is a box-shadow, so nothing
 * reflows) and hue-free. The ring is `foreground` on every coloured fill and
 * `muted-foreground` on the neutral tier, which is the one fill a light ring
 * would disappear into. `destructive` is the deliberate exception: its classes
 * are ruled untouched by this pass.
 *
 * **The neutral emphasis tier keeps the `secondary` name and no longer draws from
 * `--secondary`.** The violet fill retired; the tier below the amber CTA is the
 * app's own ink at fill weight (`bg-foreground text-background`) — emphasis
 * without a meaning, which is exactly right now that every hue is committed to
 * one. Do not "restore" `bg-secondary` here: the token still exists for the
 * lore/display uses violet narrowed to, and this variant is not one of them.
 *
 * **Grammar fills.** valor / harmony / glow / wit colour a button by what the
 * action *means*, and the doctrine that governs them is narrow on purpose: a
 * grammar fill only where the action **is** the family's word (valor = adventure,
 * harmony = people, glow = growth, wit = knowledge), never beside a primary CTA,
 * never two grammar fills in one view, and never on a destructive action. Wit
 * fills **soft**: wit-strong is 4.10:1 against dark ink and fails the 4.5:1 body
 * threshold this recipe's 16px sits under. Every fill takes dark ink
 * (`text-background`) — measured, not eyeballed: valor 6.69:1, harmony 6.11:1,
 * glow 6.63:1, wit-soft 8.10:1, neutral 16.00:1.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:ring-2 hover:ring-foreground",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-foreground text-background shadow-sm hover:ring-2 hover:ring-muted-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        valor:
          "bg-yty-valor-strong text-background shadow hover:ring-2 hover:ring-foreground",
        harmony:
          "bg-yty-harmony-strong text-background shadow hover:ring-2 hover:ring-foreground",
        glow: "bg-yty-glow-strong text-background shadow hover:ring-2 hover:ring-foreground",
        wit: "bg-yty-wit-soft text-background shadow hover:ring-2 hover:ring-foreground",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
