"use client";

import type { SupportedLocale } from "@/lib/constants/locales";
import { cn } from "@/lib/utils";
import { TeamProfileBody } from "@/components/team/team-profile-body";
import type { TeamProfile } from "@/services/team-profiles/team-profiles.types";

/**
 * A profile as the public will see it: the public page's own body in a frame,
 * on the page ground it will stand on there. The editor's live preview and an
 * admin's read of a saved profile on the user page are both this frame, so
 * what an admin reads before making a profile public is what the person saw
 * while writing it.
 *
 * **The frame is framed content** — the page as it will appear, the way a file
 * preview's edge belongs to the file — so it may sit inside a card without
 * being a card inside a card.
 *
 * **It grows with its content unless told to scroll.** The editor keeps the
 * preview sticky beside its form, so from its two-column width the frame fills
 * what is left of the viewport and scrolls within it (`scrollFrom`, inside a
 * flex column that bounds its height). Anywhere else the page scrolls instead.
 */
export function TeamProfilePreviewFrame({
  profile,
  readerLocale,
  scrollFrom,
}: {
  profile: TeamProfile;
  /** Which of the profile's languages to show; see `TeamProfileBody`. */
  readerLocale?: SupportedLocale;
  /** The breakpoint from which the frame scrolls within a bounded column. */
  scrollFrom?: "lg" | "xl";
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-background",
        scrollFrom === "lg" && "lg:min-h-0 lg:overflow-y-auto",
        scrollFrom === "xl" && "xl:min-h-0 xl:overflow-y-auto",
      )}
    >
      <TeamProfileBody profile={profile} readerLocale={readerLocale} />
    </div>
  );
}
