import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative flex rounded-lg border text-sm",
  {
    variants: {
      // A status alert wears its family at full value on the edge and in the
      // ink, over a neutral ground. The half-alpha edge and the tinted ground it
      // replaces were the same mistake twice: a hue mixed down toward the page
      // is no longer that hue, and the edge — the one part of an alert that is
      // read as "something is wrong here" before a word of it is — was the
      // faintest thing on the box.
      variant: {
        default: "border-border bg-muted/50 text-foreground",
        destructive: "border-destructive bg-muted text-destructive",
        success: "border-success bg-muted text-success",
        info: "border-info bg-muted text-yty-wit-soft",
        warning: "border-warning bg-muted text-warning",
      },
      align: {
        left: "items-start gap-3 p-3",
        center: "items-center justify-center gap-2 px-6 py-4",
      },
    },
    defaultVariants: {
      variant: "default",
      align: "left",
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, align, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant, align }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("font-medium leading-none", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-muted-foreground", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription, alertVariants };
