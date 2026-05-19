import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { ROUTES, ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants";
import { NavChevron } from "@/components/ui/nav-chevron";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { GeduCoverageEditor } from "@/components/gedu/gedu-coverage-editor";
import { computeAge, formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { getServerTimezone } from "@/lib/timezone.server";
import { UsersService } from "@/services/users";
import { GamerService } from "@/services/gamers";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: userId } = await params;
  const [t, c, locale, timeZone] = await Promise.all([
    getTranslations("admin.users"),
    getTranslations("common"),
    getLocale(),
    getServerTimezone(),
  ]);

  const supabase = await createClient();
  const usersService = new UsersService(supabase);
  const gamerService = new GamerService(supabase);

  const profile = await usersService.getProfile(userId).catch(() => null);

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

  const isCustomer = profile.role === "customer";
  const isGamer = profile.role === "gamer";
  const isGedu = profile.role === "gedu";

  const [linkedGamers, linkedParents, gamerProfile] = await Promise.all([
    isCustomer
      ? gamerService.getLinkedGamers(userId).catch(() => [])
      : Promise.resolve([]),
    isGamer
      ? gamerService.getLinkedParents(userId).catch(() => [])
      : Promise.resolve([]),
    isGamer
      ? gamerService.getGamerProfile(userId).catch(() => null)
      : Promise.resolve(null),
  ]);

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
              {[profile.first_name, profile.last_name].filter(Boolean).join(" ")}
            </h1>
            {!isGamer && profile.email && (
              <div className="flex items-center gap-2">
                <p className="text-muted-foreground">{profile.email}</p>
              </div>
            )}
            {isGamer && gamerProfile && (
              <p className="text-sm text-muted-foreground">
                <span>{t('ageYears', { age: computeAge(gamerProfile.date_of_birth, timeZone) })}</span>
                {gamerProfile.gender && (
                  <>
                    {/* eslint-disable-next-line i18next/no-literal-string -- visual separator between two i18n strings, not user-facing copy */}
                    <span aria-hidden="true"> · </span>
                    <span>{t(`gender.${gamerProfile.gender}`)}</span>
                  </>
                )}
              </p>
            )}
            <div className="mt-2 flex items-center gap-3">
              <Badge className={ROLE_BADGE_STYLES[profile.role]}>
                {c(ROLE_LABEL_KEYS[profile.role])}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {t('joined')} {profile.created_at ? formatDate(profile.created_at, locale, { dateStyle: "medium", timeZone }) : t('unknown')}
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
            {isCustomer && linkedGamers.length > 0 && (
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
                          {gamer.first_name || t('unnamedGamer')}
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
            {isCustomer && linkedGamers.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('noConnectedGamers')}</p>
            )}
            {isGamer && linkedParents.length > 0 && (
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
                          {parent.first_name || t('unnamedUser')}
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
