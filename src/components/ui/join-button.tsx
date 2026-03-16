"use client";

import Link from "next/link";
import { Loader2, PhoneCall } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface JoinButtonBaseProps {
  disabled?: boolean;
  loading?: boolean;
  /** Prevent click from bubbling (e.g. inside a clickable card). */
  stopPropagation?: boolean;
}

interface JoinButtonLinkProps extends JoinButtonBaseProps {
  href: string;
  onClick?: never;
}

interface JoinButtonClickProps extends JoinButtonBaseProps {
  href?: never;
  onClick: () => void;
}

type JoinButtonProps = JoinButtonLinkProps | JoinButtonClickProps;

/**
 * Shared Join button used across group cards, lounge cards, and detail pages.
 * Renders as a Link when given `href`, or a `<button>` when given `onClick`.
 */
export function JoinButton({ href, onClick, disabled, loading, stopPropagation }: JoinButtonProps) {
  if (loading) {
    return (
      <div className={cn(buttonVariants({ size: "sm" }), "w-20 justify-center shrink-0 opacity-50 pointer-events-none")}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  const classes = cn(
    buttonVariants({ size: "sm" }),
    "w-20 justify-center gap-1.5 shrink-0",
    disabled && "pointer-events-none opacity-50",
  );

  if (onClick) {
    return (
      <button
        className={classes}
        disabled={disabled}
        onClick={stopPropagation ? (e) => { e.stopPropagation(); onClick(); } : onClick}
      >
        <PhoneCall className="h-4 w-4" />
        Join
      </button>
    );
  }

  return (
    <Link
      href={href!}
      className={classes}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      <PhoneCall className="h-4 w-4" />
      Join
    </Link>
  );
}
