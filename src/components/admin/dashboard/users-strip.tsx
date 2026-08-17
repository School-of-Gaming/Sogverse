/* eslint-disable i18next/no-literal-string -- design-mock phase; see the note on
   `product-attention-grid.tsx`. */
import Link from "next/link";
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

interface RolePresentation {
  label: string;
  icon: LucideIcon;
}

const ROLE_PRESENTATION: Record<UserRole, RolePresentation> = {
  customer: { label: "Parents", icon: Users },
  gamer: { label: "Gamers", icon: Gamepad2 },
  gedu: { label: "Gedus", icon: GraduationCap },
  admin: { label: "Admins", icon: ShieldCheck },
};

export function UsersStrip({ stats }: { stats: readonly AdminUserRoleStat[] }) {
  return (
    <section aria-label="Users" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <UserRoleTile key={stat.role} stat={stat} />
      ))}
    </section>
  );
}

function UserRoleTile({ stat }: { stat: AdminUserRoleStat }) {
  const presentation = ROLE_PRESENTATION[stat.role];
  const Icon = presentation.icon;

  return (
    <Link
      href={ROUTES.admin.users}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-foreground/30 hover:bg-accent"
    >
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{presentation.label}</span>
        {(stat.verified !== null || stat.certified !== null) && (
          <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            {stat.verified !== null && (
              <span className="inline-flex items-center gap-1">
                <MailCheck className="h-3 w-3" aria-hidden />
                {stat.verified} verified
              </span>
            )}
            {stat.certified !== null && (
              <span className="inline-flex items-center gap-1">
                <BadgeCheck className="h-3 w-3" aria-hidden />
                {stat.certified} certified
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
