import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative flex rounded-lg border text-sm",
  {
    variants: {
      variant: {
        default: "border-border bg-muted/50 text-foreground",
        destructive:
          "border-destructive/50 bg-destructive/10 text-destructive",
        success: "border-success/50 bg-success/10 text-success",
        info: "border-info/50 bg-info/10 text-info",
        warning: "border-warning/50 bg-warning/10 text-warning",
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
