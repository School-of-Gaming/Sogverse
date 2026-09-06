"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Info,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The four statuses, which are the alert's variants beside its neutral default.
 */
type AlertStatus = "destructive" | "success" | "info" | "warning";

/**
 * The canonical glyph for each status, and the only place the app decides which
 * glyph names which state.
 *
 * A status never reaches the reader as colour alone: colour reinforces, the
 * glyph and the label inform, so removing the colour loses nothing. Every
 * hand-rolled callout that carries a status draws from this map rather than
 * picking a glyph of its own, which is what keeps one meaning per mark across
 * the app.
 */
export const STATUS_GLYPH: Record<AlertStatus, LucideIcon> = {
  destructive: AlertCircle,
  success: Check,
  info: Info,
  warning: AlertTriangle,
};

/**
 * The status ink, spent on the glyph and on a title that is a label.
 *
 * The panel itself is never tinted. A status colour exists at the value it is
 * authored at or not at all, so it arrives as a figure on the neutral ground
 * the alert already sits on — glyph, and label — never as a wash behind a
 * paragraph.
 */
const STATUS_INK: Record<AlertStatus, string> = {
  destructive: "text-destructive",
  success: "text-success",
  info: "text-info",
  warning: "text-warning",
};

/**
 * The alert's ground is whatever it is sitting on.
 *
 * The neutral default lifts off its card, because it has no glyph and no colour
 * to mark it out; a status alert is marked by its glyph and its edge, so it
 * adds no ground of its own and reads correctly on the page, on a card and on
 * the lifted grey alike.
 */
const alertVariants = cva(
  "relative flex rounded-lg border border-border text-sm",
  {
    variants: {
      variant: {
        default: "bg-lifted text-foreground",
        destructive: "text-foreground",
        success: "text-foreground",
        info: "text-foreground",
        warning: "text-foreground",
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

/**
 * The status's own mark, at the head of the panel.
 *
 * A component rather than a branch inside `Alert` so the status is narrowed
 * once, where the glyph and the ink are looked up together.
 */
function AlertGlyph({
  status,
  align,
}: {
  status: AlertStatus;
  align?: "left" | "center" | null;
}) {
  const Glyph = STATUS_GLYPH[status];
  return (
    <Glyph
      className={cn(
        "h-4 w-4 shrink-0",
        align === "center" ? undefined : "mt-0.5",
        STATUS_INK[status]
      )}
      aria-hidden
    />
  );
}

/** What the title needs in order to know whether it may take the colour. */
const AlertVariantContext = React.createContext<AlertStatus | "default">(
  "default"
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, align, children, ...props }, ref) => {
  const status = variant && variant !== "default" ? variant : null;
  return (
    <AlertVariantContext.Provider value={status ?? "default"}>
      <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant, align }), className)}
        {...props}
      >
        {status === null ? null : <AlertGlyph status={status} align={align} />}
        {children}
      </div>
    </AlertVariantContext.Provider>
  );
});
Alert.displayName = "Alert";

/**
 * The alert's title.
 *
 * A title that names the state — "Payment failed", "Report sent" — is a label,
 * and a label takes the status colour beside the glyph in the same hue. A title
 * that is a sentence is something the reader reads *through*, so it stays ink
 * and the glyph carries the colour alone; say so with `sentence`.
 */
const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & { sentence?: boolean }
>(({ className, sentence = false, ...props }, ref) => {
  const variant = React.useContext(AlertVariantContext);
  return (
    <h5
      ref={ref}
      className={cn(
        "font-medium leading-none",
        variant === "default" || sentence
          ? "text-foreground"
          : STATUS_INK[variant],
        className
      )}
      {...props}
    />
  );
});
AlertTitle.displayName = "AlertTitle";

/**
 * A status sentence: the words in ink, the status glyph beside them in its hue.
 *
 * The shape an error, a warning or a confirmation takes when it is a **sentence**
 * rather than a label — a field's validation message, a save that did not take,
 * a line under a control. Coloured ink is for labels, so what says which status
 * this is here is the mark; the words are read through and stay ink.
 *
 * It is not the alert panel: no ground, no edge and no padding of its own, so it
 * sits directly under the thing it is about.
 */
const StatusLine = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement> & {
    status: AlertStatus;
    /** Matches the type size of whatever the line sits under. */
    size?: "sm" | "xs";
    /** Quiet ink, where the line's neighbours are quiet too. */
    muted?: boolean;
  }
>(({ status, size = "sm", muted = false, className, children, ...props }, ref) => {
  const Glyph = STATUS_GLYPH[status];
  return (
    <p
      ref={ref}
      className={cn(
        "flex items-start gap-1.5",
        size === "sm" ? "text-sm" : "text-xs",
        muted ? "text-muted-foreground" : "text-foreground",
        className
      )}
      {...props}
    >
      <Glyph
        className={cn(
          "shrink-0",
          size === "sm" ? "mt-0.5 h-4 w-4" : "mt-px h-3.5 w-3.5",
          STATUS_INK[status]
        )}
        aria-hidden
      />
      <span className="min-w-0">{children}</span>
    </p>
  );
});
StatusLine.displayName = "StatusLine";

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

export { Alert, AlertTitle, AlertDescription, StatusLine, alertVariants };
