import Link from "next/link";
import { useTranslations } from "next-intl";
import { NavChevron } from "@/components/ui/nav-chevron";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants";
import type { UserRole } from "@/types";

interface UserRowUser {
  id: string;
  display_name: string | null;
  username: string | null;
  email: string | null;
  role: UserRole;
}

interface UserRowProps {
  user: UserRowUser;
  linkedGamers?: UserRowUser[];
  /** Base path for user detail links. Defaults to "/admin/users" */
  basePath?: string;
}

export function UserRow({ user, linkedGamers, basePath = "/admin/users" }: UserRowProps) {
  const t = useTranslations('admin.users');
  const c = useTranslations('common');
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
              {user.display_name || user.username || t('unnamedUser')}
            </p>
            <p className="text-sm text-muted-foreground">
              {user.email || user.username}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
                  {gamer.display_name || gamer.username || t('unnamedGamer')}
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
