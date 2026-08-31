"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SwitchProfileDialog } from "@/components/family/SwitchProfileDialog";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { buildFamilySessionFeed } from "@/lib/family-session-feed";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { useAuth, useNow } from "@/providers";
import { useFamilyProductFeed } from "@/services/family-product-feed";
import {
  seedAge,
  useMyUpcomingSessionRows,
  type MyUpcomingSessionRow,
} from "@/services/participations";
import type { SessionAudience } from "@/types";
import { FamilyProductNotFound } from "./FamilyProductNotFound";
import { FamilyProductPageBody } from "./FamilyProductPageBody";
import { FamilyProductPageSkeleton } from "./FamilyProductPageSkeleton";

/**
 * The data shell behind `/parent/{clubs,camps,events}/[id]` and its gamer
 * twin — one enrollment's page, keyed by **participation id**.
 *
 * **Two reads, and they answer different halves of the page.**
 *
 * The feed RPC answers everything about the club itself: whoever holds the
 * seat, the product shell and its schedule, the group and its note, the site,
 * the gedus, and the group's whole stored history. It is self-scoping, so a
 * participation that is not this caller's and one with no group yet come back
 * as `unavailable` rather than as an error — both render the not-found card.
 *
 * The participation rows answer everything about **this family's place in it**:
 * whether the card behind the subscription is failing, and when paid access
 * runs out on a membership the parent has cancelled. That is deliberately not
 * on the feed document — the feed describes a group, and a group does not have
 * a billing state — and it comes from the very cache entry the dashboard's
 * corner badge reads, under the same key, so a card that badges a problem and
 * the page it opens cannot disagree about whether there is one.
 *
 * **`accessUntil` is threaded into the builder, not just into the notice.** A
 * cancelled enrollment must show nothing past its paid window *anywhere*, so
 * the same instant that words the notice also bounds the occurrence walk. Pass
 * it to one and not the other and the page says "last session on the 14th"
 * over a feed listing the 21st.
 *
 * **The calendar math is not in either read.** The RPC returns schedule
 * parameters and stored rows; the walk forward, the walk backward and the merge
 * happen here, in a `useMemo` over the shared 30-second clock, so entry kinds
 * advance while the page is open. Both this memo and the feed component read
 * `useNow()`, which is one context value — every consumer sees the same instant
 * in the same commit, so the live tag and the entry kind it depends on cannot
 * straddle a tick.
 *
 * **On a direct load both reads are already answered.** The route's server half
 * runs the same pair and hands them down — the feed hydrated under the hook's
 * own key, the rows as `initialData` — so the first frame is the finished page.
 * Everything below is written as though it had not: the skeleton and the
 * not-found card are what a client-side navigation, a refetch and a failed
 * prefetch still land on.
 */
export function FamilyProductPage({
  participationId,
  audience,
  initialSessionRows,
}: {
  participationId: string;
  /** Whose copy of the page this is — the URL prefix the route was reached by. */
  audience: SessionAudience;
  /**
   * The viewer's active participation rows, server-prefetched — or `null` when
   * that prefetch failed, which is a different thing from no rows and is
   * treated as one below.
   */
  initialSessionRows: MyUpcomingSessionRow[] | null;
}) {
  const { data: result, isPending } = useFamilyProductFeed(participationId);
  /**
   * Who is reading, so the page can tell "my child's club" from "my club".
   *
   * The URL cannot answer this — both live under `/parent` — and the feed
   * document deliberately does not either: it names the participant and stops
   * there, which is the shape the privacy line wants. Comparing that id with
   * the signed-in user is the whole derivation, and `useAuth` is the right
   * source for it because the id is **server-seeded**: the root layout hands
   * `initialUser` down, so SSR and the first client render agree and nothing on
   * the masthead re-words itself after hydration.
   */
  const { user } = useAuth();
  const rows = useMyUpcomingSessionRows(audience, {
    initialData: initialSessionRows ?? [],
    // A failed prefetch is seeded **stale**, so the client refetches on mount
    // rather than trusting an empty list for the next 60 seconds. The stake on
    // this page specifically: no rows means no paid-through instant, so a
    // cancelled enrollment would quietly lose its clamp and the future block
    // would run past the paid window, on a page that never asks again. The rule
    // itself is `seedAge`, shared with the dashboards' roll-up hooks.
    initialDataUpdatedAt: seedAge(initialSessionRows),
  });
  const now = useNow();
  const locale = resolveLocale(useLocale());

  /**
   * The join a parent clicked, held until the switch dialog resolves it. Same
   * shape as the dashboard's, minus the lookup: this page is about exactly one
   * enrollment, so there is only ever one destination to capture.
   */
  const [switching, setSwitching] = useState(false);

  const feed = result?.status === "ok" ? result.feed : null;

  /**
   * This enrollment's row among the viewer's active participations.
   *
   * `undefined` is a real and harmless answer: a waitlisted or unplaced
   * participation is not in this read at all (and has no page behind it
   * either), and a rows read that failed degrades to `[]`. Both leave the page
   * with no billing notice and no clamp, which is the same fallback the
   * dashboards take and is strictly the *quieter* wrong answer of the two
   * available.
   */
  const row = useMemo(
    () =>
      rows.find((candidate) => candidate.participationId === participationId) ??
      null,
    [rows, participationId],
  );
  const accessUntil = row?.subscriptionEndsAt ?? null;

  const entries = useMemo(
    () =>
      feed === null
        ? []
        : buildFamilySessionFeed({
            groupId: feed.group.id,
            timezone: feed.product.timezone,
            slots: feed.product.schedule_slots.map((slot) => ({
              weekday: slot.weekday,
              startTime: slot.start_time,
              durationMinutes: slot.duration_minutes,
            })),
            startDate: feed.product.start_date,
            endDate: feed.product.end_date,
            sessions: feed.sessions,
            now,
            accessUntil,
          }),
    [feed, now, accessUntil],
  );

  /**
   * The last session the paid window still covers — **the same rule the
   * dashboard card applies**, stated canonically beside the roll-up: the
   * furthest-out session inside the window if any are still to come, otherwise
   * the most recent one that already ran.
   *
   * Here it is a single array read, because the feed above is already exactly
   * that set. Entries are clamped at `accessUntil` and sorted newest-first, and
   * ordering by start and by end are the same ordering (one entry per
   * product-local date, so none overlap) — which means any future entry sorts
   * above every past one and `entries[0]` *is* the rule's answer in both
   * branches at once.
   *
   * Reading it off the rendered feed rather than re-deriving it is what stops
   * the notice naming a date the sessions beneath it disagree with. `null` only
   * when the window covers nothing at all, which is the case the notice has its
   * own sentence for.
   */
  const lastSessionStart = entries[0]?.startsAt ?? null;

  if (isPending) return <FamilyProductPageSkeleton audience={audience} />;
  if (feed === null) return <FamilyProductNotFound audience={audience} />;

  const participant = {
    id: feed.participant.id,
    firstName: feed.participant.first_name,
  };
  /**
   * The parent's own seat: a `/parent` page whose participant is the reader.
   *
   * Resolved here rather than passed down from the route, because the route
   * prefix fixes the *role* and nothing more — a parent reaches their own club
   * and their child's through the same six URLs. It is deliberately conjoined
   * with the customer audience rather than derived from the id alone: on a
   * `/gamer` route the reader **is** the participant by definition, and calling
   * that a self seat would swap the child's own copy for the parent's.
   */
  const isSelfSeat = audience === "customer" && user?.id === participant.id;
  /** Whether the Join has an account switch behind it — a child's seat only. */
  const switchesAccount = audience === "customer" && !isSelfSeat;
  const productName =
    resolveTranslation(feed.product.translations, locale)?.name ?? "";
  const voiceHref = ROUTES.voice.groupSession(feed.group.id);

  return (
    <>
      <FamilyProductPageBody
        audience={isSelfSeat ? "self" : audience}
        productName={productName}
        schedule={{
          product_type: feed.product.product_type,
          timezone: feed.product.timezone,
          start_date: feed.product.start_date,
          end_date: feed.product.end_date,
          schedule_slots: feed.product.schedule_slots,
        }}
        isRemote={feed.product.is_remote}
        participant={participant}
        groupName={feed.group.name}
        // Handed over on both audiences: the body is what decides that a child
        // never meets a billing notice, and withholding the props here would
        // move that decision somewhere a future caller could get it wrong.
        paymentProblem={row?.paymentProblem ?? false}
        cancellation={
          accessUntil === null ? null : { accessUntil, lastSessionStart }
        }
        gedus={feed.gedus.map((gedu) => ({
          id: gedu.id,
          firstName: gedu.first_name,
        }))}
        groupPublicNote={feed.group.public_note}
        site={
          feed.site === null
            ? null
            : {
                name: feed.site.name,
                address: feed.site.address,
                publicNote: feed.site.public_note,
              }
        }
        voiceHref={voiceHref}
        // A parent looking at their *child's* club is signed in as themselves
        // while the room is gated by the child's enrollment, so their Join is
        // intercepted: the dialog POSTs the account switch and then does the
        // full-page navigation itself, per the house auth rule. A gamer is
        // already the right person — and so is a parent on their own seat — so
        // both get no handler and the button stays a plain link.
        onJoinClick={switchesAccount ? () => setSwitching(true) : undefined}
        entries={entries}
        sourceTimeZone={feed.product.timezone}
      />

      {switching && (
        <JoinSwitchDialog
          gamer={participant}
          productName={productName}
          voiceHref={voiceHref}
          onClose={() => setSwitching(false)}
        />
      )}
    </>
  );
}

/**
 * The account switch standing between a parent's Join and the room.
 *
 * The parent is signed in as themselves and the room is gated by the child's
 * enrollment, so joining means becoming the child first. The dialog POSTs the
 * switch and then does the full-page navigation itself — the house auth rule,
 * since the cookies that route sets never reach the browser client's in-memory
 * session and a soft navigation would land the room on a stale one.
 *
 * Its own component so the parent-only copy namespace is read on the parent's
 * copy of the page and nowhere else: a child's route has no account to switch
 * into and no business reaching for the vocabulary of one.
 */
function JoinSwitchDialog({
  gamer,
  productName,
  voiceHref,
  onClose,
}: {
  gamer: { id: string; firstName: string };
  productName: string;
  voiceHref: string;
  onClose: () => void;
}) {
  const t = useTranslations("parent");

  return (
    <SwitchProfileDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      target={{ id: gamer.id, role: "gamer", first_name: gamer.firstName }}
      redirectUrl={voiceHref}
      title={t("switchToGamer.title", { name: gamer.firstName, productName })}
      oneWayWarning={t("switchToGamer.oneWayWarning")}
    />
  );
}
