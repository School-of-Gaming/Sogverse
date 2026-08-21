import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One labelled fact: a glyph, a small uppercase label, and whatever the value
 * turns out to be.
 *
 * The whole admin product page is built out of these, in three different grids,
 * which is why it is a component rather than three near-identical blocks. What
 * it deliberately does **not** do is decide whether a fact is worth rendering —
 * a caller that has nothing to say omits the fact entirely rather than drawing
 * an empty one, because a labelled blank reads as a value that failed to load.
 */
export function Fact({
  icon: Icon,
  label,
  className,
  children,
}: {
  icon: LucideIcon;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex gap-3", className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className="mt-0.5 text-sm">{children}</div>
      </div>
    </div>
  );
}

/**
 * The grid facts sit in: two columns from `sm`, three from `xl`.
 *
 * Three, because this is an admin surface and an admin surface is allowed to use
 * the width it has. The live page caps at two and leaves a third of a monitor
 * empty beside a column of one-line values.
 */
export function FactGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  );
}
