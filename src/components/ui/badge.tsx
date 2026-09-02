import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow",
        // **Keeps the `secondary` name and no longer draws from `--secondary`.**
        // The quiet label tier: neutral ground, the app's own ink, and
        // deliberately no meaning — violet narrowed to "the world" (lore,
        // display), and a generic badge variant is the opposite of a world
        // moment. Same move the button recipe's neutral emphasis tier makes.
        // Do not "restore" `bg-secondary` here: the token still exists for the
        // lore/display uses violet narrowed to, and this variant is not one.
        secondary: "border-transparent bg-muted text-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
