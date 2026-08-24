"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ROLE_DASHBOARD_PATHS } from "@/lib/constants";
import { useAuth } from "@/providers";

/**
 * A home-page call to action that points a signed-in reader at their own
 * dashboard instead.
 *
 * The front page is written to a stranger: every headline CTA asks them to make
 * an account. A parent who already has one meets those buttons every time they
 * land on the site — and since the header's mark now takes them to their
 * dashboard, the front page is somewhere they arrive deliberately. Asking them
 * to register again is the page not knowing who it is talking to; the same
 * button, worded and aimed like the header's own logo slot, is.
 *
 * The label is the one the header uses: "My SOG" for a family or a gedu,
 * "Dashboard" for the admin, whose panel is genuinely an admin panel.
 *
 * **Nothing about this shifts.** The root layout resolves the session
 * server-side and seeds `AuthProvider` with it, so the server already renders
 * whichever version the reader gets — there is no post-hydration swap on the
 * ordinary path. Where auth does have to resolve in the browser (a session the
 * server did not see), the signed-out CTA is what stands until it does, and the
 * swap replaces this button's own label and target rather than adding or
 * removing anything around it.
 */
export function HomeCtaLink({
  signedOutHref,
  signedOutLabel,
  className,
  children,
}: {
  /** Where a visitor with no account goes — usually the register page. */
  signedOutHref: string;
  /** What the button says to that visitor. */
  signedOutLabel: string;
  className?: string;
  /** Trailing content kept in both states, e.g. the hero's arrow. */
  children?: ReactNode;
}) {
  const c = useTranslations("common");
  const { user, profile } = useAuth();

  const dashboardPath =
    user && profile?.role ? ROLE_DASHBOARD_PATHS[profile.role] : null;

  return (
    <Link href={dashboardPath ?? signedOutHref} className={className}>
      {dashboardPath
        ? profile?.role === "admin"
          ? c("goToDashboard")
          : c("goToMySog")
        : signedOutLabel}
      {children}
    </Link>
  );
}
