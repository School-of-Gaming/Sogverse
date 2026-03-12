"use client";

import Link from "next/link";
import { Loader2, PhoneCall } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface JoinButtonProps {
  href: string;
  disabled?: boolean;
  loading?: boolean;
  /** Prevent click from bubbling (e.g. inside a clickable card). */
  stopPropagation?: boolean;
}

/**
 * Shared Join button used across group cards, lounge cards, and detail pages.
 * Renders as a Link styled as a small button with a fixed width.
 */
export function JoinButton({ href, disabled, loading, stopPropagation }: JoinButtonProps) {
  if (loading) {
    return (
      <div className={cn(buttonVariants({ size: "sm" }), "w-20 justify-center shrink-0 opacity-50 pointer-events-none")}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ size: "sm" }),
        "w-20 justify-center gap-1.5 shrink-0",
        disabled && "pointer-events-none opacity-50",
      )}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      <PhoneCall className="h-4 w-4" />
      Join
    </Link>
  );
}
