"use client";

import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { UnknownAvatar } from "@/components/ui/unknown-avatar";
import { AccountMenu } from "@/components/layout/account-menu";
import { Link } from "@/i18n/navigation";
import type { UserRole } from "@/lib/constants/roles";
import { ROUTES } from "@/lib/constants/routes";
import { useAuth } from "@/providers";

/**
 * The account slot, in its four states — all of them the same 32px box in
 * the same place, so nothing on the strip moves as auth resolves:
 *
 *   - while auth is resolving, a non-interactive faded silhouette. The slot
 *     must not become a control that a hurried click could fire before we
 *     know whose account it belongs to;
 *   - signed in with a profile, the avatar is the trigger of the account
 *     menu, which owns everything that used to hang off this slot (the
 *     dashboard trip, the family switch, settings, sign-out);
 *   - signed in with the profile row still in flight, the identicon behind a
 *     link to login. The menu is built entirely from the role, so there is no
 *     menu to offer yet — but the slot is the only account affordance on the
 *     page and must never be a dead end, so it keeps the exit it had before
 *     the menu existed. Login is the right one precisely *because* a
 *     signed-in visitor never arrives there: the proxy looks their role up
 *     and bounces them straight to their own dashboard. What the trip buys is
 *     the repair — it is a full-page navigation, so the RSC reads the profile
 *     again and hands the root layout a header with its menu in place.
 *     Nothing about the session is re-established; the session was never the
 *     thing that failed, the profile read was;
 *   - signed out, a plain link to login, unchanged.
 */
export function AccountSlot({ navRole }: { navRole?: UserRole }) {
  const { user, profile, isLoading } = useAuth();
  const t = useTranslations("header");
  const c = useTranslations("common");

  if (isLoading) {
    return (
      <span className="rounded-md">
        <Avatar className="h-8 w-8">
          <UnknownAvatar faded />
        </Avatar>
      </span>
    );
  }
  if (!user) {
    return (
      <Link
        href={ROUTES.login}
        aria-label={c("signIn")}
        className="rounded-md focus:outline-none focus:ring-2 focus:ring-act"
      >
        <Avatar className="h-8 w-8">
          <UnknownAvatar />
        </Avatar>
      </Link>
    );
  }
  if (!profile) {
    return (
      <Link
        href={ROUTES.login}
        // Not "Sign in": this reader already is. The label names what the trip
        // actually does for them — the login route bounces a signed-in visitor
        // onward to their own account — and it stays role-agnostic, because the
        // profile that would say which dashboard is the thing that is missing.
        aria-label={t("continueToAccount")}
        className="rounded-md focus:outline-none focus:ring-2 focus:ring-act"
      >
        <Avatar className="h-8 w-8">
          <Identicon id={user.id} size={32} />
        </Avatar>
      </Link>
    );
  }
  return (
    <AccountMenu
      userId={profile.id}
      role={profile.role}
      firstName={profile.first_name}
      registrationOwed={profile.registration_completed_at === null}
      // Carried through rather than resolved here: the menu's copy of the
      // override governs only its own nav rows (the gedu's three items),
      // exactly as this one governs only the strip.
      navRole={navRole}
    />
  );
}
