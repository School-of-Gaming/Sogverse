import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { NavChevron } from "@/components/ui/nav-chevron";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants";
import type { UserRole } from "@/types";

interface UserRowUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  /** When the address was confirmed from the recipient's own inbox, or null. */
  email_verified_at: string | null;
  role: UserRole;
}

interface UserRowProps {
  user: UserRowUser;
  linkedGamers?: UserRowUser[];
  /** Base path for user detail links. Defaults to "/admin/users" */
  basePath?: string;
  /**
   * Whether an admin has certified this educator: `true` shows the mark, `false`
   * withholds it, and `null` means the answer is unknown — the read failed, or
   * this row is not a gedu and the question does not arise. Three states rather
   * than two because "not certified" and "we could not find out" must not
   * collapse into each other; only a positive answer may print the mark.
   */
  certified?: boolean | null;
}

/**
 * One admin users-list row.
 *
 * **Two marks that mean two different things, in a fixed order.** The shield is
 * about a *person* — an admin has certified this educator — and the green check
 * is about an *address*, confirmed by whoever reads that inbox. A certified gedu
 * with a verified email carries both, so the order never varies with which of
 * them is present: certification first, verification second, then the role
 * badge. Scanning a column of rows only works if a given mark is always in the
 * same place.
 *
 * A gamer gets neither. Their address is the synthetic
 * `@gamer.sogverse.internal` one their account was created with, so there is no
 * inbox to confirm it from and a check would be asserting something nobody did.
 *
 * **Both marks are printed only on a positive answer.** A mark is a claim
 * somebody made, so the absence of an answer has to read the same as "no" — see
 * `certified` for the three states that keeps honest.
 */
export function UserRow({ user, linkedGamers, basePath = "/admin/users", certified }: UserRowProps) {
  const t = useTranslations('admin.users');
  const c = useTranslations('common');
  const emailVerified = user.role !== "gamer" && user.email_verified_at !== null;
  return (
    <div className="rounded-lg border">
      <Link
        href={`${basePath}/${user.id}`}
        className="group flex items-center justify-between p-4 transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <div className="flex items-center gap-4">
          <Avatar>
            <Identicon id={user.id} size={40} />
          </Avatar>
          <div>
            <p className="font-medium">
              {(user.role !== "gamer"
                ? [user.first_name, user.last_name].filter(Boolean).join(" ")
                : user.first_name) || t('unnamedUser')}
            </p>
            {user.role !== "gamer" && user.email && (
              <p className="text-sm text-muted-foreground">{user.email}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user.role === "gedu" && certified === true && (
            <ShieldCheck
              className="h-4 w-4 text-success"
              aria-label={t('certification.certified')}
            />
          )}
          {emailVerified && (
            <CheckCircle2
              className="h-4 w-4 text-success"
              aria-label={t('emailVerified')}
            />
          )}
          <Badge className={ROLE_BADGE_STYLES[user.role]}>
            {c(ROLE_LABEL_KEYS[user.role])}
          </Badge>
          <NavChevron />
        </div>
      </Link>

      {user.role === "customer" && (!linkedGamers || linkedGamers.length === 0) && (
        <div className="border-t bg-muted/30 py-3 pl-14 pr-4">
          <p className="text-sm text-muted-foreground">{t('noConnectedGamers')}</p>
        </div>
      )}

      {linkedGamers && linkedGamers.length > 0 && (
        <div className="border-t bg-muted/30">
          {linkedGamers.map((gamer) => (
            <Link
              key={gamer.id}
              href={`${basePath}/${gamer.id}`}
              className="group flex items-center justify-between py-3 pr-4 pl-14 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-7 w-7">
                  <Identicon id={gamer.id} size={28} />
                </Avatar>
                <p className="text-sm font-medium">
                  {gamer.first_name || t('unnamedGamer')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${ROLE_BADGE_STYLES.gamer} text-[10px] px-2 py-0`}>
                  {c("roleGamer")}
                </Badge>
                <NavChevron size="sm" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
