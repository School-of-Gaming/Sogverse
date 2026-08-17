"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BadgeCheck,
  Gamepad2,
  GraduationCap,
  MailCheck,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ROUTES } from "@/lib/constants";
import type { UserRole } from "@/types";
import type { AdminUserRoleStat } from "./admin-dashboard-data";

/**
 * Who is on the platform, as a slim full-width strip of four tiles — and the
 * first thing on the page.
 *
 * Leading with it is not a claim that it is the most urgent thing here; the
 * queue below it is. It is a *pulse*: what the platform is, before the queue says
 * what is wrong with it. One row of tiles is taken in without stopping, so it
 * costs the queue almost nothing of the fold, which is the only reason a section
 * this un-urgent can sit at the top at all.
 *
 * It began as a column beside the attention queue and that was the wrong shape
 * twice over: four short lines cannot fill a column whose height is set by an
 * unrelated section, so the panel was mostly dead space — and the space it was
 * eating was the width the queue needed to stop truncating product names. Four
 * numbers want a strip, and the queue wants the page.
 *
 * It replaces the placeholder's "Total users" tile, because one number was never
 * the question: 579 accounts says nothing, while "19 gedus, 12 certified" is a
 * staffing fact somebody can act on. So each tile carries the sub-stat its role
 * actually has, and no tile invents one it does not.
 *
 * **Gamers have no verified count, and that absence is deliberate.** A gamer's
 * email is a synthetic `@gamer.sogverse.internal` address nobody will ever open,
 * so "0 verified" would report a problem that cannot exist. The stat is `null`
 * in the data and renders as nothing here — not a zero, not a dash. Its tile is
 * simply shorter than the others rather than padded to match, since nothing
 * survives the difference for a hole to matter to.
 */

/**
 * The glyph each role wears. The *name* is not here: it is
 * `admin.dashboard.users.roles.<role>`, keyed by the database's own role
 * identifier so a tile cannot be labelled by anything but the role it counts.
 *
 * A `Record` over the enum rather than a lookup with a fallback, so a role added
 * to `user_role` stops the build here and makes somebody choose its icon. The
 * RPC will already be counting it — it enumerates the enum — but the page's own
 * two lists (this, and the order the strip reads in) are hand-maintained.
 */
const ROLE_ICON: Record<UserRole, LucideIcon> = {
  customer: Users,
  gamer: Gamepad2,
  gedu: GraduationCap,
  admin: ShieldCheck,
};

export function UsersStrip({ stats }: { stats: readonly AdminUserRoleStat[] }) {
  const t = useTranslations("admin.dashboard.users");

  return (
    <section
      aria-label={t("label")}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {stats.map((stat) => (
        <UserRoleTile key={stat.role} stat={stat} />
      ))}
    </section>
  );
}

function UserRoleTile({ stat }: { stat: AdminUserRoleStat }) {
  const t = useTranslations("admin.dashboard.users");
  const Icon = ROLE_ICON[stat.role];

  return (
    <Link
      href={ROUTES.admin.users}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-foreground/30 hover:bg-accent"
    >
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">
          {t(`roles.${stat.role}`)}
        </span>
        {(stat.verified !== null || stat.certified !== null) && (
          <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            {stat.verified !== null && (
              <span className="inline-flex items-center gap-1">
                <MailCheck className="h-3 w-3" aria-hidden />
                {t("verified", { count: stat.verified })}
              </span>
            )}
            {stat.certified !== null && (
              <span className="inline-flex items-center gap-1">
                <BadgeCheck className="h-3 w-3" aria-hidden />
                {t("certified", { count: stat.certified })}
              </span>
            )}
          </span>
        )}
      </span>
      <span className="shrink-0 text-2xl font-bold tabular-nums">
        {stat.total}
      </span>
    </Link>
  );
}
