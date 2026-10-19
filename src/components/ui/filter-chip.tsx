import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface FilterChipProps {
  /** Whether the filter this chip stands for is on. */
  active: boolean;
  onClick: () => void;
  /** The glyph the chip's vocabulary carries, ahead of its word. */
  icon?: ReactNode;
  /**
   * The chip's accessible name, for a chip whose visible content is richer than
   * plain text. It must contain every word the chip shows: a reader using
   * speech input says what they see (WCAG 2.5.3).
   */
  ariaLabel?: string;
  /** Sizing only — a fixed width, centred digits. Never colour or state. */
  className?: string;
  children: ReactNode;
}

/**
 * One pill-shaped filter toggle: filled with act while its filter is on, plain
 * while it is off. Shared by the shop's browse filters and the admin product
 * list's type row, so a chip reads the same on every list that narrows by one.
 */
export function FilterChip({
  active,
  onClick,
  icon,
  ariaLabel,
  className,
  children,
}: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-all",
        active
          ? "bg-act text-act-foreground shadow-sm"
          : "bg-background text-foreground hover:bg-hover",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
