"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { PadletLink } from "@/components/ui/padlet-link";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  endDateToCutoff,
  enumerateRowOccurrences,
  OPEN_ENDED_OCCURRENCE_CAP,
  startDateToCutoff,
} from "@/lib/session-occurrence";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { isVoiceWindowOpen } from "@/lib/voice-window";
import { ROUTES } from "@/lib/constants";
import { formatDate, formatTime } from "@/lib/utils";
import { useNow, useTimezone } from "@/providers";
import { useGeduAssignedProduct } from "@/services/assignments";
import type {
  GeduAssignedProduct,
  GeduAssignedProductShell,
} from "@/types";
import { AssignedGroupCard } from "./AssignedGroupCard";
import { PeerGroupCard } from "./PeerGroupCard";

interface SessionDetailsPageProps {
  productId: string;
}

/**
 * The Gedu's session-details surface — reached from any session card on
 * the gedu dashboard. Page is product-scoped: the entry point is a
 * specific session occurrence, but the data inside (every group, every
 * gedu assigned to those groups, the full roster + parent emails for the
 * caller's own group) lives at the product level.
 *
 * The same component renders behind three URL prefixes
 * (`/gedu/clubs/[id]`, `/gedu/camps/[id]`, `/gedu/events/[id]`) — the
 * dashboard card builds the link with `ROUTES.gedu.assignedProduct(...)`
 * so the URL prefix matches the product type the gedu signed up to teach.
 *
 * Data comes from `useGeduAssignedProduct` (RPC `get_gedu_assigned_product`).
 * The RPC raises 42501 for products the caller isn't assigned to; the
 * service surfaces that as `null` so we render a clean "not your session"
 * empty state instead of a thrown error.
 */
export function SessionDetailsPage({ productId }: SessionDetailsPageProps) {
  const { data, isLoading } = useGeduAssignedProduct(productId);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <BackLink />

      {isLoading ? (
        <LoadingState />
      ) : !data ? (
        <NotAssignedState />
      ) : (
        <Loaded data={data} />
      )}
    </div>
  );
}

function BackLink() {
  const t = useTranslations("gedu.sessionDetails");
  return (
    <Link
      href={ROUTES.gedu.dashboard}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {t("back")}
    </Link>
  );
}

function LoadingState() {
  return (
    <Card className="mt-6">
      <CardContent className="flex justify-center p-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function NotAssignedState() {
  const t = useTranslations("gedu.sessionDetails");
  return (
    <Card className="mt-6">
      <CardContent className="p-8 text-center">
        <h2 className="text-base font-semibold">{t("notAssignedTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("notAssignedBody")}
        </p>
      </CardContent>
    </Card>
  );
}

function Loaded({ data }: { data: GeduAssignedProduct }) {
  const t = useTranslations("gedu.sessionDetails");
  const locale = useLocale();
  const uiLocale = resolveLocale(locale);
  const timeZone = useTimezone();
  const now = useNow();

  const productName =
    resolveTranslation(data.product.translations, uiLocale)?.name ?? "";

  // Assigned group first, then peers in the RPC's order (created_at, id).
  // `find`/`filter` preserve that order for the peers while lifting the
  // caller's own group to the top so the "Your group" anchor leads.
  // `my_group_id` is the single source for "which group is mine".
  const { assignedGroup, peerGroups } = useMemo(() => {
    const assigned =
      data.groups.find((g) => g.id === data.my_group_id) ?? null;
    const peers = data.groups.filter((g) => g.id !== data.my_group_id);
    return { assignedGroup: assigned, peerGroups: peers };
  }, [data.groups, data.my_group_id]);

  const voiceState = useMemo(
    () =>
      computeVoiceState({
        product: data.product,
        now,
        locale,
        timeZone,
      }),
    [data.product, now, locale, timeZone],
  );

  return (
    <div className="mt-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t(`typeLabel.${data.product.product_type}`)}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            {productName}
          </h1>
        </div>
        {data.product.padlet_url && (
          <PadletLink href={data.product.padlet_url} />
        )}
      </header>

      {assignedGroup ? (
        <AssignedGroupCard
          group={assignedGroup}
          isRemote={data.product.is_remote}
          voiceIsOpen={voiceState.voiceIsOpen}
          opensDate={voiceState.opensDate}
          opensTime={voiceState.opensTime}
        />
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t("noAssignedGroup")}
          </CardContent>
        </Card>
      )}

      {peerGroups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("otherGroupsHeading")}
          </h2>
          <div className="space-y-4">
            {peerGroups.map((g) => (
              <PeerGroupCard
                key={g.id}
                group={g}
                isRemote={data.product.is_remote}
                voiceIsOpen={voiceState.voiceIsOpen}
                opensDate={voiceState.opensDate}
                opensTime={voiceState.opensTime}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Resolve the next session occurrence + voice-window state for the page.
 * Every group on the product shares the same schedule, so we compute it
 * once at the page level and thread the same `(voiceIsOpen, opensDate,
 * opensTime)` triple into every group card. Reuses the same primitive
 * (`enumerateRowOccurrences`) and the shared `isVoiceWindowOpen` helper the
 * dashboard expansion uses, so the lock-state windows can never drift
 * between the dashboard card and this page.
 *
 * Falls back to "voice closed, no scheduled date" when the product has
 * no future occurrence in the iteration window (camp ended, no remaining
 * slots) — the button stays disabled with empty labels.
 *
 * KNOWN / out of scope: `voiceIsOpen` is computed from the schedule alone,
 * independent of `is_remote`. For an in-person product the cards still pass
 * `voiceIsOpen` through, so the Join button renders enabled but inert
 * (`voiceHref` is `"#"` for in-person — see `AssignedGroupCard`). This is
 * the same trap the gedu dashboard `GroupCard` has (`TODO.md`); in-person
 * products are out of scope for now, so we leave it rather than gating the
 * live state on `is_remote` here.
 */
function computeVoiceState(args: {
  product: GeduAssignedProductShell;
  now: Date;
  locale: string;
  timeZone: string;
}): { voiceIsOpen: boolean; opensDate: string; opensTime: string } {
  const { product, now, locale, timeZone } = args;
  const windowCloseMs = VOICE_CONFIG.SESSION_WINDOW_AFTER_MINUTES * 60_000;

  const slots = product.schedule_slots.map((s) => ({
    weekday: s.weekday,
    startTime: s.start_time,
    durationMinutes: s.duration_minutes,
  }));

  const occurrences = enumerateRowOccurrences({
    slots,
    timezone: product.timezone,
    now,
    startBoundary: startDateToCutoff(product.start_date, product.timezone),
    endBoundary: endDateToCutoff(product.end_date, product.timezone),
    cap:
      product.end_date === null ? OPEN_ENDED_OCCURRENCE_CAP : Number.POSITIVE_INFINITY,
    windowCloseMs,
  });
  occurrences.sort((a, b) => a.start.getTime() - b.start.getTime());

  if (occurrences.length === 0) {
    return { voiceIsOpen: false, opensDate: "", opensTime: "" };
  }

  const next = occurrences[0];

  return {
    voiceIsOpen: isVoiceWindowOpen(next.start, next.end, now),
    opensDate: formatDate(next.start, locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone,
    }),
    opensTime: formatTime(next.start, locale, timeZone),
  };
}
