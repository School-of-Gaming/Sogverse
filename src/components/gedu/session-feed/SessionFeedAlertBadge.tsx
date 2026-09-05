"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { BADGE_FRAME } from "@/components/ui/card-corner-badge";
import { cn } from "@/lib/utils";

/**
 * "3 sessions need attention" — the aggregate of a group's owed past sessions
 * still missing their register, their report, or both.
 *
 * Renders nothing at zero. A badge that says "0 sessions need attention" is
 * worse than no badge: it trains the eye to skip the spot where the real
 * warning will appear.
 *
 * **Two shapes, one meaning.** `inline` is the labelled pill that sits in a row
 * of content and says the whole sentence. `corner` is the same fact overlaid on
 * a card's top-right corner as a count, for the dashboard grid — where a gedu
 * is not reading cards but sweeping them for the one that owes something, and a
 * mark on the corner is found in a glance across a whole grid in a way a pill
 * inside the card's body never was.
 *
 * **A corner badge over a clickable card takes an `href`, and it is not
 * optional in spirit.** The badge is a mark rather than a control, so it was
 * built as one — and that made the single spot the sweep model tells a gedu to
 * tap into a dead zone: a `cursor-default` image sitting *above* the card's
 * stretched link, eating the click that was meant for it. It now goes where the
 * card goes, which is the only place it could sensibly go. The `href` stays
 * optional because the inline shape has no card behind it and a future corner
 * use might sit on something inert; a badge without one keeps the plain mark and
 * must not be put over a link.
 */
export function SessionFeedAlertBadge({
  count,
  variant = "inline",
  href,
  className,
}: {
  count: number;
  variant?: "inline" | "corner";
  /**
   * Where the corner badge goes when tapped — the same target the card under it
   * opens, so the two can never send a gedu to different places.
   */
  href?: string;
  className?: string;
}) {
  const t = useTranslations("gedu.sessionFeed");

  if (count <= 0) return null;

  const label = t("alertBadge", { count });

  if (variant === "corner") {
    // The shared corner frame every overlaid card badge uses, with a solid
    // severity fill — a bare number on a translucent wash read as decoration,
    // not as an alert. The icon carries the "something is owed" meaning the
    // count alone couldn't; the full sentence still travels via the accessible
    // name. Icon + count is the compact pill form; it ends where the card's
    // content padding begins, sitting just above the chevron cluster.
    const cornerClass = cn(
      BADGE_FRAME,
      "gap-1 px-2 text-xs font-semibold tabular-nums",
      "bg-warning text-warning-foreground",
      className,
    );
    const body = (
      <>
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        {count}
      </>
    );

    if (href === undefined) {
      return (
        <div
          role="img"
          aria-label={label}
          title={label}
          className={cn(cornerClass, "cursor-default")}
        >
          {body}
        </div>
      );
    }

    return (
      <Link
        href={href}
        onClick={(e) => {
          if (href === "#") e.preventDefault();
        }}
        aria-label={label}
        title={label}
        className={cn(
          cornerClass,
          "transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        {body}
      </Link>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 bg-warning/10 text-warning",
        className,
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Badge>
  );
}
