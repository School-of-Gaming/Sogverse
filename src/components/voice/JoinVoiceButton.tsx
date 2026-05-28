"use client";

import Link from "next/link";
import { AudioLines, Lock } from "lucide-react";
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
  /** Button size variant — defaults to `sm` to match the dashboard card. */
  size?: "sm" | "default";
}

/**
 * The single Join Voice button shared across every surface that joins a
 * group voice room: parent / gamer `NextSessionCard`, the gedu dashboard's
 * prominent `GroupCard`, and every group card on the gedu session-details
 * page. An enabled `Link` to `/voice/group/[id]` when the window is open
 * (or a `<button>` firing `onJoinClick` when one is passed), a disabled
 * button with a lock icon + "Opens {date} at {time}" otherwise.
 *
 * Copy is centralized in the `voiceButton.*` translation namespace so
 * every caller speaks the same words — adjusting the label means one edit
 * per locale, not three. On the gedu details page every group on the
 * product shares the same schedule, so each card shows the same locked-
 * state copy when the window is closed; that repetition is intentional
 * (full reuse over a one-off banner).
 */
export function JoinVoiceButton({
  voiceIsOpen,
  voiceHref,
  opensDate,
  opensTime,
  onJoinClick,
  size = "sm",
}: JoinVoiceButtonProps) {
  const t = useTranslations("voiceButton");

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
    return (
      <Link
        href={voiceHref}
        prefetch={false}
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
