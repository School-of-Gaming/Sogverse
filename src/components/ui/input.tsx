import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // text-base (16px = default body size) on purpose: anything under 16px
          // makes iOS Safari auto-zoom the page on focus, which widens the
          // viewport into a page-wide horizontal scroll. There's no design reason
          // a field should be smaller than default text, so this is the base.
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          // A field the form has refused wears a full-value red edge, keyed off
          // the attribute that already says so. It lives on the primitive rather
          // than at call sites for the reason every guard does: a surface cannot
          // forget it, and `aria-invalid` was until now announced to a screen
          // reader and drawn to nobody.
          "aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
