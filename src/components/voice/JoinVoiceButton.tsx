"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AudioLines, Lock, UserRoundSearch } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface JoinVoiceButtonProps {
  /** Whether the voice window is currently open for this product. */
  voiceIsOpen: boolean;
  /** Where the open button navigates. `"#"` keeps the button inert (in-person products). */
  voiceHref: string;
  /** Pre-formatted "next open" date label, e.g. "Wed, May 28". */
  opensDate: string;
  /** Pre-formatted "next open" time label, e.g. "14:55". */
  opensTime: string;
  /**
   * Optional click handler. When present, the open variant renders as a
   * `<button>` and `onJoinClick` fires instead of navigating to
   * `voiceHref`. Used by the parent dashboard, which intercepts the click
   * to open the switch-to-gamer dialog (the parent is signed in as
   * themselves; the voice room is gated by the gamer's enrollment).
   */
  onJoinClick?: () => void;
  /**
   * The gamer is purchased but not yet placed in a group. When the window is
   * open, there's still no room to join — so instead of the active Join CTA
   * the button renders a disabled "matching with a Gedu" state, while the
   * card around it keeps its live styling. A not-yet-open awaiting session
   * falls through to the normal locked "Opens …" button (which reads fine).
   * Defaults to `false`; only the parent/gamer session cards pass it.
   */
  awaiting?: boolean;
  /** Button size variant — defaults to `sm` to match the dashboard card. */
  size?: "sm" | "default";
}

/**
 * The single Join Voice button shared across every surface that joins a
 * group voice room: parent / gamer `NextSessionCard`, the gedu dashboard's
 * prominent `GroupCard`, and every group card on the gedu session-details
 * page. An enabled `Link` to `/voice/group/[id]` when the window is open
 * (or a `<button>` firing `onJoinClick` when one is passed), a disabled
 * button with a lock icon + "Opens {date} at {time}" otherwise. The one
 * exception is `awaiting`: an unplaced gamer whose window is open can't join
 * yet, so the open state is replaced by a disabled "matching with a Gedu"
 * button (the surrounding card still renders its live state).
 *
 * Copy is centralized in the `voiceButton.*` translation namespace so
 * every caller speaks the same words — adjusting the label means one edit
 * per locale, not three. On the gedu details page every group on the
 * product shares the same schedule, so each card shows the same locked-
 * state copy when the window is closed; that repetition is intentional
 * (full reuse over a one-off banner).
 *
 * The link always carries a `?back=<current path>` query so leaving the
 * voice room returns the user to the page they launched from instead of
 * the role dashboard. The voice route validates the path before honoring
 * it (must start with `/`, not `//`) so this surface can't be turned into
 * an open redirect. Callers don't need to pass anything for this — we read
 * the pathname here.
 */
export function JoinVoiceButton({
  voiceIsOpen,
  voiceHref,
  opensDate,
  opensTime,
  onJoinClick,
  awaiting = false,
  size = "sm",
}: JoinVoiceButtonProps) {
  const t = useTranslations("voiceButton");
  const pathname = usePathname();

  // Window's open but the gamer isn't placed yet: the card keeps its live
  // styling, but there's no room to join until an admin matches them with a
  // Gedu, so the button states *why* instead of inviting a join that would
  // go nowhere. (A not-yet-open awaiting session has `voiceIsOpen === false`
  // and falls through to the normal locked "Opens …" button below.)
  if (voiceIsOpen && awaiting) {
    return (
      <button
        type="button"
        disabled
        className={cn(buttonVariants({ size }), "gap-1.5")}
      >
        <UserRoundSearch className="h-4 w-4" />
        {t("awaitingMatch")}
      </button>
    );
  }

  if (voiceIsOpen) {
    if (onJoinClick) {
      return (
        <button
          type="button"
          onClick={onJoinClick}
          className={cn(buttonVariants({ size }), "gap-1.5")}
        >
          <AudioLines className="h-4 w-4" />
          {t("joinVoice")}
        </button>
      );
    }
    const hrefWithBack =
      voiceHref === "#" || !pathname
        ? voiceHref
        : `${voiceHref}?back=${encodeURIComponent(pathname)}`;
    return (
      <Link
        href={hrefWithBack}
        onClick={(e) => {
          if (voiceHref === "#") e.preventDefault();
        }}
        className={cn(buttonVariants({ size }), "gap-1.5")}
      >
        <AudioLines className="h-4 w-4" />
        {t("joinVoice")}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled
      className={cn(buttonVariants({ size, variant: "secondary" }), "gap-1.5")}
    >
      <Lock className="h-4 w-4" />
      {t("locked", { date: opensDate, time: opensTime })}
    </button>
  );
}
