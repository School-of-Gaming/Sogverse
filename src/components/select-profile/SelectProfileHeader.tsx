"use client";

import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { UnknownAvatar } from "@/components/ui/unknown-avatar";
import { LocalePicker } from "@/components/layout/locale-picker";
import { SiteHeaderShell } from "@/components/layout/site-header-shell";

/**
 * Simplified header for /select-profile.
 *
 * Replaces the standard app `Header` while the viewer (parent or gamer) is
 * choosing which family member is entering Sogverse. Differences:
 *   - The "SOG Sogverse" mark is non-clickable. Sending the user home would
 *     yank them out of the picker mid-decision.
 *   - No public nav links — there's nothing else to do from this screen.
 *   - The avatar slot stays an UnknownAvatar inside a non-interactive frame
 *     even though someone is signed in. The page itself is the avatar
 *     picker, so duplicating that affordance in the header would be noise.
 *   - Reuses `LocalePicker` verbatim so the language switcher is consistent.
 *
 * Outer chrome (sticky bar, backdrop blur, height) comes from
 * `<SiteHeaderShell>`, the same shell the main app `Header` uses — visual
 * tweaks there carry here automatically.
 */
export function SelectProfileHeader() {
  const c = useTranslations("common");

  return (
    <SiteHeaderShell>
      <nav className="container mx-auto flex h-full items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4">
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-display text-xl font-bold text-primary">
            SOG
          </span>
          <span className="hidden text-lg font-semibold sm:inline-block">
            {c("appName")}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <LocalePicker />
          <Avatar className="h-8 w-8">
            <UnknownAvatar />
          </Avatar>
        </div>
      </nav>
    </SiteHeaderShell>
  );
}
