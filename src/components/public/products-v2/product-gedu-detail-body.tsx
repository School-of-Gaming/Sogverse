"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Loader2, Users } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { computeProductSessions } from "@/components/calendar/compute-product-sessions";
import { SessionCalendarView } from "@/components/calendar/session-calendar-view";
import { ProductWhenWhereCard } from "./product-when-where-card";
import { useGeduProductDetail } from "@/services/products-v2";
import { useAuth } from "@/providers/auth-provider";
import { cn, computeAge } from "@/lib/utils";
import type {
  GenderType,
  GroupV2GeduDetail,
  GroupV2ParticipationDetail,
  ProductGroupV2WithDetails,
  ProductTypeV2,
} from "@/types";
import type { ProductV2DetailRow } from "@/services/products-v2";

// Gedu detail body — step one of the gedu product-details rollout
// (docs/products-redesign.md). Hero (image + name + type label + tagline),
// session calendar, then a groups section that mirrors the admin panel
// without write affordances: every group in the product is visible, the
// viewer's own group(s) get a "Your group" accent so a Gedu can spot
// themselves in a multi-group product at a glance.
//
// No signup panel, no pricing — gedus don't purchase. The unassigned-gamer
// tray is intentionally absent in step one; see docs/products-v2-architecture.md
// "Gedu details page — unassigned-gamers tray" for the follow-up.

interface ProductGeduDetailBodyProps {
  product: ProductV2DetailRow;
}

export function ProductGeduDetailBody({ product }: ProductGeduDetailBodyProps) {
  const uiLocale = resolveLocale(useLocale());
  const t = useTranslations("productDetail");

  const tr = resolveTranslation(product.product_translations_v2, uiLocale);

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <BackLink productType={product.product_type} />

        <div className="mt-6 grid grid-cols-[96px_1fr] items-start gap-x-4 gap-y-3 sm:grid-cols-[140px_1fr] sm:gap-x-6">
          <ProductThumbnail
            imagePath={product.image_path ?? ""}
            alt={tr?.name ?? ""}
            size="aspect-square w-full"
            className="rounded-lg [&>img]:aspect-square [&>img]:h-full [&>img]:w-full [&>img]:object-cover"
          />

          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t(`typeLabel.${product.product_type}`)}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {tr?.name}
            </h1>
            {tr?.description && (
              <p className="mt-2 hidden text-muted-foreground sm:block">
                {tr.description}
              </p>
            )}
          </div>

          {tr?.description && (
            <p className="col-span-2 text-muted-foreground sm:hidden">
              {tr.description}
            </p>
          )}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="min-w-0 md:col-span-1 [&>*]:h-full">
            <ProductWhenWhereCard product={product} />
          </div>
          <div className="min-w-0 md:col-span-2 [&>*]:h-full">
            <CalendarCard product={product} />
          </div>
        </div>

        <div className="mt-8">
          <GroupsSection productId={product.id} />
        </div>
      </div>
    </div>
  );
}

function BackLink({ productType }: { productType: ProductTypeV2 }) {
  const t = useTranslations("productDetail.back");
  const href = backHref(productType);
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {t(productType)}
    </Link>
  );
}

function backHref(productType: ProductTypeV2): string {
  switch (productType) {
    case "consumer_club":
    case "municipality_club":
      return "/clubs";
    case "camp":
      return "/camps";
    case "event":
      return "/events";
  }
}

// Mirrors the calendar card on the parent detail body. Same primitives —
// pulling them into a shared component is overkill for two callers; if a
// third lands we can lift.
function CalendarCard({ product }: { product: ProductV2DetailRow }) {
  const t = useTranslations("productDetail.sections");
  const uiLocale = resolveLocale(useLocale());

  const result = computeProductSessions({
    productType: product.product_type,
    startDate: product.start_date,
    endDate: product.end_date,
    scheduleSlots: product.schedule_slots_v2,
    holidays: product.holidays,
  });
  if (!result) return null;

  // "Today" must be derived from the product's timezone — using UTC would
  // land on the wrong day for any non-UTC viewer near midnight. See
  // CLAUDE.md "Date & Time".
  const todayIso = formatInTimeZone(new Date(), product.timezone, "yyyy-MM-dd");

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("calendar")}
        </h2>
        <div className="mt-4">
          <SessionCalendarView
            rangeStart={result.rangeStart}
            rangeEnd={result.rangeEnd}
            sessions={result.sessions}
            skips={result.skips}
            locale={uiLocale}
            todayIso={todayIso}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// Renders every group in the product. The viewer's own group(s) — anywhere
// they appear as one of the assigned gedus — get a "Your group" badge and
// a primary border accent. Sister groups render with the same density so a
// Gedu can scan teammates' rosters and (in a future iteration) jump in to
// cover sessions.
function GroupsSection({ productId }: { productId: string }) {
  const t = useTranslations("productDetail.geduGroups");
  const { user } = useAuth();
  const { data, isLoading } = useGeduProductDetail(productId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Lift the viewer's own group(s) to the front while preserving the RPC's
  // display_order within each partition. Stable partition (not a custom
  // comparator on isOwn ? -1 : 1) so two non-own groups keep their relative
  // order even when JS engines use unstable sort fallbacks.
  const sortedGroups = (() => {
    const all = data?.groups ?? [];
    const own: ProductGroupV2WithDetails[] = [];
    const other: ProductGroupV2WithDetails[] = [];
    for (const g of all) {
      (ownsGroup(g, user?.id) ? own : other).push(g);
    }
    return [...own, ...other];
  })();

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {t("heading")}
      </h2>
      {sortedGroups.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t("emptyNoGroups")}
          </CardContent>
        </Card>
      ) : (
        <div
          className={cn(
            "grid gap-4",
            sortedGroups.length >= 2 && "md:grid-cols-2",
          )}
        >
          {sortedGroups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              isOwn={ownsGroup(group, user?.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ownsGroup(
  group: ProductGroupV2WithDetails,
  userId: string | undefined,
): boolean {
  if (!userId) return false;
  return group.gedus.some((g) => g.id === userId);
}

function GroupCard({
  group,
  isOwn,
}: {
  group: ProductGroupV2WithDetails;
  isOwn: boolean;
}) {
  const t = useTranslations("productDetail.geduGroups");

  return (
    <Card
      className={cn(
        "h-full transition-colors",
        isOwn && "ring-2 ring-primary",
      )}
    >
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold leading-tight">{group.name}</h3>
          {isOwn && (
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              {t("yourGroupBadge")}
            </Badge>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("educatorsLabel")}
          </p>
          {group.gedus.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noEducators")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {group.gedus.map((g) => (
                <GeduChip key={g.id} gedu={g} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("gamersLabel")}
            </p>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Users className="h-3 w-3" />
              {t("gamerCount", { count: group.participations.length })}
            </span>
          </div>
          {group.participations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("emptyNoGamers")}</p>
          ) : (
            <ul className="space-y-1.5">
              {group.participations.map((p) => (
                <GamerRow key={p.id} participation={p} />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GeduChip({ gedu }: { gedu: GroupV2GeduDetail }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-muted px-2.5 py-1 text-xs">
      <Avatar className="h-5 w-5">
        <Identicon id={gedu.id} size={20} />
      </Avatar>
      <span className="leading-none">{gedu.first_name}</span>
    </div>
  );
}

const GENDER_KEY: Record<GenderType, "genderBoy" | "genderGirl" | "genderNonBinary"> = {
  boy: "genderBoy",
  girl: "genderGirl",
  non_binary: "genderNonBinary",
};

function GamerRow({
  participation,
}: {
  participation: GroupV2ParticipationDetail;
}) {
  const t = useTranslations("productDetail.geduGroups");

  const detailParts: string[] = [];
  if (participation.gamer_date_of_birth) {
    detailParts.push(
      t("age", { age: computeAge(participation.gamer_date_of_birth) }),
    );
  }
  if (participation.gamer_gender) {
    detailParts.push(t(GENDER_KEY[participation.gamer_gender]));
  }
  const detail = detailParts.join(" · ");

  return (
    <li className="flex items-center gap-2.5 rounded-md border border-border bg-card px-2.5 py-1.5">
      <Avatar className="h-7 w-7">
        <Identicon id={participation.gamer_id} size={28} />
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">
          {participation.gamer_first_name}
        </p>
        {detail && (
          <p className="text-[11px] leading-tight text-muted-foreground">
            {detail}
          </p>
        )}
      </div>
    </li>
  );
}
