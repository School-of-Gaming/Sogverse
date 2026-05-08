"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { ROUTES } from "@/lib/constants";
import { ArrowLeft, Users } from "lucide-react";
import { NavChevron } from "@/components/ui/nav-chevron";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { useProfile } from "@/services/users";
import { useLinkedGamers, useLinkedParents } from "@/services/gamers";
import { GeduCoverageEditor } from "@/components/gedu/gedu-coverage-editor";
import { ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export default function AdminUserDetailPage() {
  const t = useTranslations('admin.users');
  const c = useTranslations('common');
  const params = useParams();
  const userId = params.id as string;
  const locale = useLocale();

  const { data: profile, isLoading: profileLoading } = useProfile(userId);

  const isCustomer = profile?.role === "customer";
  const isGamer = profile?.role === "gamer";
  const isGedu = profile?.role === "gedu";
  const { data: linkedGamers } = useLinkedGamers(isCustomer ? userId : "");
  const { data: linkedParents } = useLinkedParents(isGamer ? userId : "");

  if (profileLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href={ROUTES.admin.users} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t('backToUsers')}
        </Link>
        <p className="text-muted-foreground">{t('userNotFound')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href={ROUTES.admin.users} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t('backToUsers')}
      </Link>

      {/* User Summary */}
      <Card>
        <CardContent className="flex items-center gap-6 pt-6">
          <Avatar className="h-16 w-16">
            <Identicon id={profile.id} size={64} />
          </Avatar>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">
              {profile.display_name}
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-muted-foreground">
                {profile.email || profile.username}
              </p>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <Badge className={ROLE_BADGE_STYLES[profile.role]}>
                {c(ROLE_LABEL_KEYS[profile.role])}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {t('joined')} {profile.created_at ? formatDate(profile.created_at, locale) : t('unknown')}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Linked Accounts (customers → gamers, gamers → parents) */}
      {(isCustomer || isGamer) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {isCustomer ? t('linkedGamers') : t('linkedParents')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isCustomer && linkedGamers && linkedGamers.length > 0 && (
              <div className="space-y-2">
                {linkedGamers.map((gamer) => (
                  <Link
                    key={gamer.id}
                    href={ROUTES.admin.user(gamer.id)}
                    className="group flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <Identicon id={gamer.id} size={32} />
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {gamer.display_name || gamer.username || t('unnamedGamer')}
                        </p>
                        <p className="text-xs text-muted-foreground ">
                          {gamer.username}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={ROLE_BADGE_STYLES.gamer}>
                        {c("roleGamer")}
                      </Badge>
                      <NavChevron size="sm" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
            {isCustomer && (!linkedGamers || linkedGamers.length === 0) && (
              <p className="text-sm text-muted-foreground">{t('noConnectedGamers')}</p>
            )}
            {isGamer && linkedParents && linkedParents.length > 0 && (
              <div className="space-y-2">
                {linkedParents.map((parent) => (
                  <Link
                    key={parent.id}
                    href={ROUTES.admin.user(parent.id)}
                    className="group flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <Identicon id={parent.id} size={32} />
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {parent.display_name || parent.username || t('unnamedUser')}
                        </p>
                        <p className="text-xs text-muted-foreground ">
                          {parent.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={ROLE_BADGE_STYLES.customer}>
                        {c("roleParent")}
                      </Badge>
                      <NavChevron size="sm" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Gedu coverage areas — substitute matching */}
      {isGedu && <GeduCoverageEditor geduId={userId} />}
    </div>
  );
}
