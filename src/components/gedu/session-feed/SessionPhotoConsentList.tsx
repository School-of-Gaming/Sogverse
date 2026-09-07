"use client";

import { Camera, CameraOff, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { SessionFeedGamer } from "./types";

/**
 * Who may be in this session's photographs, and the one thing a gedu has to do
 * before taking one anyway.
 *
 * **It renders only on a product that asks the photo consent**, which today is
 * the Roblox Programme delivered with Lynx Educate. On every other product the
 * photo block above the thumbnails is byte-for-byte what it always was: School
 * of Gaming does not use gamer photos on its own products, so it does not ask,
 * and a list of permissions nobody was asked for would be a list of "no"s that
 * mean nothing.
 *
 * **Absence is a refusal.** The map this takes carries `true` only for a child
 * whose parent has granted every consent the product asks; a child with no
 * answer on file and a child whose parent said no render identically, because
 * they are the same instruction — that child stays out of the photograph.
 *
 * **The note is not decoration and it is not a policy summary.** A parent's
 * consent is permission to *use* a picture of their child, and it is not the
 * child's own answer to being photographed at that moment; the note says so in
 * the imperative, above the control that takes the picture, which is the only
 * place it can be read at the moment it applies.
 *
 * **The marks are the trailing element of every row, and that is load-bearing.**
 * The names come from the roster, which the page holds before any editor opens,
 * so the list's height is settled the instant the block appears; the answers
 * arrive from a read of their own, and landing at the end of a row that already
 * exists means a late answer fills the row's own slack and moves nothing on the
 * page. Do not re-order a row to put the mark first: it would be the same data
 * shoving every name sideways as it lands.
 *
 * **The emphasis is on the refusals, not on the permissions.** A gedu scanning
 * this block is looking for who must stay out of the shot, so that is the half
 * that carries the warning tone and the weight, and an allowed child sits quiet.
 * Both halves state a word beside their icon — the distinction has to survive a
 * reader who cannot separate the two colours, and it is the words a screen
 * reader reads out.
 */
export interface SessionPhotoConsentState {
  /** The session's roster — the same list the attendance register takes. */
  roster: readonly SessionFeedGamer[];
  /** Who may be photographed, keyed by roster id. A missing id is a refusal. */
  allowed: ReadonlyMap<string, boolean>;
}

export function SessionPhotoConsentList({
  roster,
  allowed,
  className,
}: SessionPhotoConsentState & { className?: string }) {
  const t = useTranslations("gedu.sessionFeed");

  return (
    <section
      className={cn(
        // `bg-card` is one step down from the strip this block sits inside,
        // whose own root is already `bg-lifted` — so a lifted ground here would
        // be the same grey twice and no step at all. It replaces a `bg-muted/20`
        // that named no token the theme defines: Tailwind emitted nothing for
        // it, so this block has been sitting on whatever the editor's own ground
        // was, not on a tint.
        "space-y-2 rounded-md border border-border bg-card p-2.5",
        className,
      )}
    >
      <p className="flex items-center gap-1.5 text-sm font-medium leading-none">
        <Info className="h-3.5 w-3.5" aria-hidden />
        {t("photoConsentTitle")}
      </p>

      <p className="text-xs text-muted-foreground">{t("photoConsentNote")}</p>

      {/* Two columns from the small breakpoint up, because this block lives
          inside an open editor beside a nine-name register and two rich-text
          fields on a laptop, and a nine-row single column would push the Save
          button off the screen. One column below it, where the whole editor is
          a single stack anyway. */}
      <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {roster.map((gamer) => {
          const may = allowed.get(gamer.id) === true;
          return (
            <li
              key={gamer.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="min-w-0 truncate">{gamer.firstName}</span>
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1",
                  may
                    ? "text-muted-foreground"
                    : "font-semibold text-warning",
                )}
              >
                {may ? (
                  <Camera className="h-3 w-3" aria-hidden />
                ) : (
                  <CameraOff className="h-3 w-3" aria-hidden />
                )}
                {may ? t("photoConsentAllowed") : t("photoConsentNotAllowed")}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
