import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Package, Users } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { ROUTES, ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { NavChevron } from "@/components/ui/nav-chevron";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { GeduCoverageEditor } from "@/components/gedu/gedu-coverage-editor";
import { GeduCertificationCard } from "@/components/admin/gedu-certification-card";
import { UserGameAccountsCard } from "@/components/admin/user-game-accounts-card";
import { cn, computeAge, formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { getServerTimezone } from "@/lib/timezone.server";
import { UsersService } from "@/services/users";
import { GamerService } from "@/services/gamers";
import { MinecraftService } from "@/services/minecraft";
import { RobloxService } from "@/services/roblox";
import { ParticipationsService } from "@/services/participations";
import type { AdminGamerParticipationRow } from "@/services/participations";
import { GeduProfilesService, type GeduCertification } from "@/services/gedu/gedu-profiles.service";
import type { ParticipationStatus, ProductType } from "@/types";

/** Status → semantic badge classes (no raw Tailwind colors — see CLAUDE.md). */
const STATUS_BADGE_STYLES: Record<ParticipationStatus, string> = {
  active: "bg-success text-success-foreground",
  waitlisted: "bg-warning text-warning-foreground",
  reserving: "bg-muted text-muted-foreground",
  completed: "bg-secondary text-secondary-foreground",
};

/**
 * One assigned-product row: product name + assigned group, with a status
 * badge, linking to that product's type-specific admin detail page.
 *
 * An *active* participation with no group is unplaced — the gamer has paid in
 * but isn't in a cohort yet, so the admin needs to assign one. That row gets a
 * warning treatment to flag the action. Waitlisted/awaiting-payment/completed
 * rows have no group by design, so those stay neutral.
 */
function AssignedProductRow({
  productType,
  productId,
  name,
  groupName,
  unassignedLabel,
  needsGroupLabel,
  status,
  statusLabel,
}: {
  productType: ProductType;
  productId: string;
  name: string;
  groupName: string | null;
  unassignedLabel: string;
  needsGroupLabel: string;
  status: ParticipationStatus;
  statusLabel: string;
}) {
  const needsGroup = status === "active" && groupName === null;
  return (
    <Link
      href={ROUTES.admin.product(productType, productId)}
      className={cn(
        "group flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent hover:text-accent-foreground",
        needsGroup && "border-warning bg-warning/5",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        {needsGroup ? (
          <p className="flex items-center gap-1 truncate text-xs font-medium text-warning">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {needsGroupLabel}
          </p>
        ) : (
          <p className="truncate text-xs text-muted-foreground">
            {groupName ?? unassignedLabel}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge className={STATUS_BADGE_STYLES[status]}>{statusLabel}</Badge>
        <NavChevron size="sm" />
      </div>
    </Link>
  );
}

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
  const minecraftService = new MinecraftService(supabase);
  const robloxService = new RobloxService(supabase);

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

  // Game identities belong to the people who play — a child, and the educator
  // running the session. A parent's or another admin's account has none, which
  // is also what the write route refuses as a target.
  const showGameAccounts = isGamer || isGedu;

  // A display choice, not a data invariant: every account is born `customer`,
  // so one promoted to admin after registering through a tagged link still
  // carries its code — this page just doesn't surface it there.
  const showReferralCode = (isCustomer || isGedu) && Boolean(profile.referral_code);

  const [
    linkedGamers,
    linkedParents,
    gamerProfile,
    minecraftAccount,
    robloxAccount,
    geduCertification,
  ] = await Promise.all([
    isCustomer
      ? gamerService.getLinkedGamers(userId).catch(() => [])
      : Promise.resolve([]),
    isGamer
      ? gamerService.getLinkedParents(userId).catch(() => [])
      : Promise.resolve([]),
    isGamer
      ? gamerService.getGamerProfile(userId).catch(() => null)
      : Promise.resolve(null),
    showGameAccounts
      ? minecraftService.getMinecraftAccount(userId).catch(() => null)
      : Promise.resolve(null),
    showGameAccounts
      ? robloxService.getRobloxAccount(userId).catch(() => null)
      : Promise.resolve(null),
    isGedu
      ? new GeduProfilesService(supabase).getOne(userId).catch(() => null)
      : Promise.resolve<GeduCertification | null>(null),
  ]);

  // Products this user is assigned to. For a gamer, their own participations;
  // for a parent, every participation across their linked gamers (grouped per
  // child below). Admin RLS (admin_full_access_participations) permits the
  // cross-user read. Fetched after the block above because the parent case
  // needs the linked-gamer ids first.
  const assignedGamerIds = isGamer
    ? [userId]
    : isCustomer
      ? linkedGamers.map((g) => g.id)
      : [];
  const assignedParticipations = assignedGamerIds.length
    ? await new ParticipationsService(supabase)
        .getParticipationsForGamers(assignedGamerIds)
        .catch(() => [] as AdminGamerParticipationRow[])
    : [];

  const participationsByGamer = new Map<string, AdminGamerParticipationRow[]>();
  for (const row of assignedParticipations) {
    const list = participationsByGamer.get(row.participant_id) ?? [];
    list.push(row);
    participationsByGamer.set(row.participant_id, list);
  }

  const uiLocale = resolveLocale(locale);
  const statusLabels: Record<ParticipationStatus, string> = {
    active: t("participationStatus.active"),
    waitlisted: t("participationStatus.waitlisted"),
    reserving: t("participationStatus.reserving"),
    completed: t("participationStatus.completed"),
  };

  const renderAssignedProducts = (rows: AdminGamerParticipationRow[]) =>
    rows.map((row) => {
      const product = row.product;
      const name =
        resolveTranslation(product.product_translations, uiLocale)?.name.trim() ||
        t("untitledProduct");
      return (
        <AssignedProductRow
          key={row.id}
          productType={product.product_type}
          productId={product.id}
          name={name}
          groupName={row.group?.name ?? null}
          unassignedLabel={t("unassignedGroup")}
          needsGroupLabel={t("needsGroup")}
          status={row.status}
          statusLabel={statusLabels[row.status]}
        />
      );
    });

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
                {/* The list shows only the positive case (a check that means
                    somebody confirmed the address); this detail page states the
                    answer both ways, because an admin looking at ONE user is
                    asking the question and deserves a definite answer rather
                    than having to know that silence means no. */}
                {profile.email_verified_at ? (
                  <CheckCircle2
                    className="h-4 w-4 shrink-0 text-success"
                    aria-label={t('emailVerified')}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t('emailNotVerified')}
                  </span>
                )}
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
            {/* The Minecraft row used to sit here, read-only. It moved into the
                editable Game accounts card below: an admin who can change these
                needs one place that shows both platforms and holds the outcome
                of a save, and a summary line that could go stale the moment the
                card underneath it was used is the wrong second home. */}
            <div className="mt-2 flex items-center gap-3">
              <Badge className={ROLE_BADGE_STYLES[profile.role]}>
                {c(ROLE_LABEL_KEYS[profile.role])}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {t('joined')} {profile.created_at ? formatDate(profile.created_at, locale, { dateStyle: "medium", timeZone }) : t('unknown')}
              </span>
              {/* Where this account came from — the marketing link's `?ref=`
                  code, captured once at registration. Read-only on purpose:
                  the column has no UPDATE grant, so an admin cannot edit it
                  through the app either (see src/lib/referral.ts). Shown for
                  parents and educators only — gamer rows are NULL by
                  construction, and the value is omitted entirely rather than
                  shown as an empty row, since the large majority of accounts
                  will never carry one. */}
              {showReferralCode && (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  {t('referralCode')}
                  {/* Code-chip treatment matching the instant voice room's
                      compact RoomLinkChip, so codes read as codes site-wide. */}
                  <span className="rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono font-semibold tracking-wider">
                    {profile.referral_code}
                  </span>
                </span>
              )}
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
              <div className="space-y-4">
                {linkedGamers.map((gamer) => {
                  const rows = participationsByGamer.get(gamer.id) ?? [];
                  return (
                    <div key={gamer.id} className="space-y-2">
                      <Link
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

                      {/* This gamer's assigned products, nested under the link */}
                      <div className="ml-4 space-y-2 border-l border-border pl-4">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Package className="h-3.5 w-3.5" />
                          {t('assignedProducts')}
                        </p>
                        {rows.length > 0 ? (
                          renderAssignedProducts(rows)
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {t('noAssignedProducts')}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
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

      {/* A gamer's own assigned products. (For parents, these are nested per
          child inside the Linked Gamers card above — no separate section.) */}
      {isGamer && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              {t('assignedProducts')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {participationsByGamer.get(userId)?.length ? (
              <div className="space-y-2">
                {renderAssignedProducts(participationsByGamer.get(userId)!)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('noAssignedProducts')}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Both game identities, editable. Admins have always had the database
          permission to fix these (a `FOR ALL` policy over `is_admin()` on both
          tables); this is the surface that finally uses it. */}
      {showGameAccounts && (
        <UserGameAccountsCard
          userId={userId}
          personName={profile.first_name}
          initialMinecraft={minecraftAccount}
          initialRoblox={robloxAccount}
        />
      )}

      {/* Gedu certification + coverage areas (substitute matching) */}
      {isGedu && <GeduCertificationCard geduId={userId} initial={geduCertification} />}
      {isGedu && <GeduCoverageEditor geduId={userId} />}
    </div>
  );
}
