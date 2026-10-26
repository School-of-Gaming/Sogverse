"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import { isSupportedCurrency } from "@/lib/constants/currency";
import { countryDisplayName } from "@/components/public/products/region-lock/region-gate";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { effectiveStatus } from "@/lib/products/effective-status";
import {
  formatProductSchedule,
  joinScheduleGroups,
} from "@/lib/products/format-product-schedule";
import { cn } from "@/lib/cn";
import { formatCurrencyFromCents } from "@/lib/money";
import { formatDate, formatDateOnly } from "@/lib/date-format";
import { useNow, useTimezone } from "@/providers";
import { useProductGroups } from "@/services/groups/groups.queries";
import { useProductsByType } from "@/services/products/products.queries";
import type { ProductWithDetails } from "@/services/products/products.service";
import {
  SwitchClubCommitError,
  useSwitchClub,
  useSwitchClubCheck,
  type SwitchClubMode,
} from "@/services/participations/switch-club.queries";
import {
  useParticipationsForGamers,
} from "@/services/participations/participations.queries";
import type { SwitchClubRefusal } from "@/services/participations/switch-club.contracts";
import { filterProductsBySearch } from "../product-name-search";
import { ProductStatusChip } from "../product-status-chip";
import { PRODUCT_TYPE_PRESENTATION } from "@/components/admin/dashboard/product-type-presentation";
import {
  heldProductIds,
  isSwitchTarget,
  moveAudienceBlock,
  noSubscriptionMoveTarget,
  orderSwitchTargets,
  type MoveAudienceBlock,
  switchTargetFacts,
  type SwitchTargetFact,
} from "./panel-rules";

// Refusal → message key. A total map rather than a chain, exactly as the
// blocked-move dialog's: a ninth refusal added to the contract then fails to
// compile until its copy exists, instead of falling through to whichever branch
// happened to be last. `as const satisfies` keeps the literal types, which is
// what lets next-intl check each key against the message tree.
const REFUSAL_KEY = {
  latest_invoice_not_paid: "latestInvoiceNotPaid",
  subscription_not_single_item: "subscriptionNotSingleItem",
  no_target_price_in_currency: "noTargetPriceInCurrency",
  participation_not_active: "participationNotActive",
  no_live_subscription: "noLiveSubscription",
  target_not_paid_subscription_club: "targetNotPaidSubscriptionClub",
  same_product: "sameProduct",
  already_on_target: "alreadyOnTarget",
  target_is_subscription_club: "targetIsSubscriptionClub",
  target_not_open_to_parents: "targetNotOpenToParents",
  target_not_open_to_gamers: "targetNotOpenToGamers",
} as const satisfies Record<SwitchClubRefusal, string>;

/**
 * Why a picker row cannot be chosen in the no-subscription move, beyond a place
 * already held: the club needs a subscription, or its audience excludes the
 * seat holder. Each value is its own `picker` message key.
 */
type MoveBlock = "needsSubscription" | MoveAudienceBlock;

/**
 * One line of facts, with whatever the row could not answer left out rather
 * than drawn as an empty gap between two separators.
 */
function joinFacts(parts: readonly string[]): string {
  return parts.filter((part) => part !== "").join(" · ");
}

interface SwitchClubSheetProps {
  /** Open state, driven by the panel — the sheet stays mounted either way. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The product the seat is on today — half of the route's path. */
  productId: string;
  participationId: string;
  /**
   * Who holds the seat — the participant, not the participation. Read for one
   * thing: the clubs this gamer already has a row on, which the picker draws
   * disabled rather than letting an admin walk into the refusal.
   */
  participantId: string;
  /** The seat holder's first name, woven into the sheet's description. */
  gamerName: string;
  /**
   * The seat holder's age today, or null on an adult seat, which carries no
   * birth month. Stated beside the target's own age range on stage two.
   */
  gamerAge: number | null;
  /**
   * The seat is an adult's own (a parent holding it themselves) rather than a
   * child's. The no-subscription move draws a product closed to the holder's
   * audience disabled, because its RPC refuses one.
   */
  holderIsAdult: boolean;
  /**
   * Told whenever the commit starts or fails, so the panel can mark the chip
   * busy for as long as money is moving. Not derived from the mutation's own
   * pending flag: that clears before the sheet closes, and a chip that un-greys
   * a frame early is a chip an admin can start dragging mid-switch.
   */
  onCommittingChange: (committing: boolean) => void;
  /**
   * Which of the sheet's two actions this is: `subscription`, the paid club
   * switch, or `no_subscription`, the move of a seat no live subscription
   * stands behind onto any product that is not billed monthly. The second
   * moves no money, and its catalogue spans every product type.
   */
  mode: SwitchClubMode;
}

/**
 * Move a subscribed seat to another consumer club, swapping the family's
 * monthly price onto that club in the same action — and placing the seat in one
 * of the target's groups on the way.
 *
 * **Two stages in one sheet.** Finding the club is a search problem: names
 * repeat across languages and terms, fifty clubs run at once, and a scrolling
 * list of names cannot be read. So stage one is a search box over rows carrying
 * when the club runs and when it starts, which is what tells two same-named
 * clubs apart. Stage two is about one club: its summary, where in it the gamer
 * sits, what changes for the family's money, and the club's own facts stated as
 * information under it.
 *
 * **The same sheet is the no-subscription move** (`mode="no_subscription"`):
 * an active seat no live subscription stands behind — free, municipality, or a
 * paid camp or event paid for once — moved onto any product that is not billed
 * monthly. Its picker lists every type, naming the type where they mix, and
 * shows the monthly clubs disabled with the reason; its second stage states
 * what the family experiences where the paid switch shows the money.
 *
 * **Always mounted, opened by its `open` prop**, like the gedu and participant
 * pickers beside it — a sheet mounted already open plays neither its enter nor
 * its exit animation, and the seat it was about has to stay readable for as
 * long as the exit runs.
 */
export function SwitchClubSheet({
  open,
  onOpenChange,
  productId,
  participationId,
  participantId,
  gamerName,
  gamerAge,
  holderIsAdult,
  onCommittingChange,
  mode,
}: SwitchClubSheetProps) {
  const t = useTranslations("admin.products.groupsPanel.switchClub");
  const tn = useTranslations(
    "admin.products.groupsPanel.switchClub.noSubscription",
  );
  const tt = useTranslations("admin.products.types");
  const c = useTranslations("common");
  const noSubscription = mode === "no_subscription";
  const uiLocale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const now = useNow();

  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [failure, setFailure] = useState<SwitchClubCommitError | null>(null);

  // One request id for the life of one OPEN — not of the mount, which now
  // outlives every open the panel makes. Every press carries it, which is what
  // makes a retry after a timeout or a failed database step replay one payment
  // request rather than charge twice; going back to the list and forward again
  // is still the same open and keeps the id, a fresh open mints a new one, and
  // the route's no-op item update is the second line of defence there.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  // The open transition does what unmounting used to: a reopened sheet is a
  // fresh one. Two things about where this lives. It fires on the false → true
  // edge rather than on close, because resetting on close would collapse stage
  // two back to the list underneath the sheet while its exit animation is still
  // playing. And it adjusts state *during* the render that sees the new prop,
  // React's own shape for derived-from-props state — an effect doing the same
  // would paint the stale stage for a frame first, and would be a cascading
  // render the lint rule exists to stop.
  //
  // The same transition latches `hasOpened`, which is what lets the club
  // catalogue read stay unfired until an admin actually asks for it: the sheet
  // is in the tree from the panel's first render, and reading every consumer
  // club on the platform for a page nobody opened a switch on is a cost with no
  // reader. The latch never clears, so Back and forward between the stages —
  // and the close animation — keep the data that is already in hand.
  const [wasOpen, setWasOpen] = useState(open);
  const [hasOpened, setHasOpened] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setHasOpened(true);
      setRequestId(crypto.randomUUID());
      setSearch("");
      setTargetId(null);
      setGroupId(null);
      setCommitting(false);
      setFailure(null);
    }
  }

  // Disabled until the first open, so `isLoading` is false while the sheet is
  // shut and true on the frame the catalogue is first asked for — which is
  // exactly when stage one wants its skeleton.
  //
  // The paid switch moves between consumer clubs only, so it reads that one
  // type. The no-subscription move may land on a product of any type and any
  // price, so it reads the other three as well, unfiltered by billing — each
  // its own cached read, the same one every other per-type list of the
  // admin's shares, and each fired only once a move is actually opened.
  const consumerClubs = useProductsByType("consumer_club", {
    enabled: hasOpened,
  });
  const municipalityClubs = useProductsByType("municipality_club", {
    enabled: hasOpened && noSubscription,
  });
  const camps = useProductsByType("camp", {
    enabled: hasOpened && noSubscription,
  });
  const events = useProductsByType("event", {
    enabled: hasOpened && noSubscription,
  });
  const products = useMemo(() => {
    if (!noSubscription) return consumerClubs.data;
    if (
      consumerClubs.data === undefined ||
      municipalityClubs.data === undefined ||
      camps.data === undefined ||
      events.data === undefined
    ) {
      return undefined;
    }
    return [
      ...consumerClubs.data,
      ...municipalityClubs.data,
      ...camps.data,
      ...events.data,
    ];
  }, [
    noSubscription,
    consumerClubs.data,
    municipalityClubs.data,
    camps.data,
    events.data,
  ]);
  const productsLoading =
    consumerClubs.isLoading ||
    (noSubscription &&
      (municipalityClubs.isLoading || camps.isLoading || events.isLoading));
  // Every place this gamer already holds, in every status — gated on the same
  // latch, because it is as pointless as the catalogue read on a sheet nobody
  // has opened. A small, indexed read of one child's rows, so the list waits
  // for nothing: while it is in flight every row stays pressable and the
  // route's own refusal is what stands behind them.
  const heldPlaces = useParticipationsForGamers(
    useMemo(() => [participantId], [participantId]),
    // The empty id is the panel's "no seat is being switched" placeholder, and
    // asking the database about it would be a round trip with no subject.
    { enabled: hasOpened && participantId !== "" },
  );
  const held = useMemo(
    () => heldProductIds(heldPlaces.data ?? []),
    [heldPlaces.data],
  );

  const check = useSwitchClubCheck(productId, participationId, targetId);
  const commit = useSwitchClub(productId, participationId);
  // The paid switch's answer, which is the only one with money in it.
  const subscriptionCheck =
    check.data?.kind === "subscription" ? check.data : undefined;
  // The target's own seating, read the moment a club is chosen — the same
  // admin-readable snapshot this panel is drawn from. It answers both of stage
  // two's questions: which groups the seat can be put in, and how full the club
  // already is.
  const targetGroups = useProductGroups(targetId ?? "");

  const source = products?.find((p) => p.id === productId) ?? null;
  const target = products?.find((p) => p.id === targetId) ?? null;

  // The rows the picker lists, and among them the ones the no-subscription
  // move shows disabled rather than hides: a monthly club, where the seat would
  // need a subscription only checkout creates, and a product whose audience
  // the seat holder is not in. The subscription reason wins where both hold —
  // no audience makes a monthly club reachable by this move.
  const { candidates, blocked } = useMemo(() => {
    const listed: ProductWithDetails[] = [];
    const reasons = new Map<string, MoveBlock>();
    for (const p of products ?? []) {
      if (!noSubscription) {
        if (isSwitchTarget(p, productId, now)) listed.push(p);
        continue;
      }
      const standing = noSubscriptionMoveTarget(p, productId, now);
      if (standing === "hidden") continue;
      listed.push(p);
      const reason =
        standing === "needsSubscription"
          ? standing
          : moveAudienceBlock(p, holderIsAdult);
      if (reason !== null) reasons.set(p.id, reason);
    }
    return { candidates: listed, blocked: reasons };
  }, [products, productId, now, noSubscription, holderIsAdult]);

  // Where the list mixes types — a free club beside a paid camp — each row
  // says which it is, because a camp and a club of the same name are told
  // apart by that first. A list of one type says nothing about it.
  const mixedTypes = useMemo(
    () => new Set(candidates.map((p) => p.product_type)).size > 1,
    [candidates],
  );

  // One line of facts per row, and the same line again above the group list in
  // stage two — the club an admin picked has to be recognisable as the club
  // they were reading a moment earlier, so the two are one function. Only the
  // schedule and the start date: a gedu's name is not what tells two clubs
  // apart to the admin doing this, and the schedule formatter already carries
  // whatever the times need to be read.
  const factsOf = useMemo(() => {
    return (product: ProductWithDetails): string => {
      const schedule = formatProductSchedule({
        product,
        locale: uiLocale,
        timeZone,
        now,
      });
      return joinFacts([
        mixedTypes
          ? tt(`${PRODUCT_TYPE_PRESENTATION[product.product_type].i18nKey}.label`)
          : "",
        schedule.kind === "recurring" ? joinScheduleGroups(schedule.groups) : "",
        formatDateOnly(product.start_date, uiLocale),
      ]);
    };
  }, [uiLocale, timeZone, now, mixedTypes, tt]);

  const rows = useMemo(
    () => orderSwitchTargets(filterProductsBySearch(candidates, search), source),
    [candidates, search, source],
  );

  // One derivation of the chosen club's lifecycle, feeding both the chip beside
  // its name and the "has not started" fact below it — two statements about the
  // same thing that must not be allowed to disagree.
  const targetStatus = target === null ? null : effectiveStatus(target, now);

  // The chosen club's own facts, stated as information under the money. The
  // seat count is the only one that arrives after the stage does, and it is
  // present as a fact from the first render (with nothing in it yet), so the
  // block stands at its final height before the snapshot lands.
  const facts: SwitchTargetFact[] =
    target === null || targetStatus === null
      ? []
      : switchTargetFacts(
          {
            minAge: target.min_age,
            maxAge: target.max_age,
            regionLockCountry: target.region_lock_country,
            startDate: target.start_date,
            status: targetStatus,
            seatCount: target.seat_count,
          },
          gamerAge,
          targetGroups.data,
        );

  const refusals = check.data?.refusals ?? [];
  // A failure carrying refusals is a gate that moved under the admin between the
  // check and the press; it kills the confirm until they pick another club,
  // exactly as a refusal from the check does. Pressing again cannot change the
  // fact behind it, so it must never be offered as a retry — even when the
  // money moved first.
  const commitRefusals = failure?.refusals ?? [];
  // The one failure the admin can act on from here: Stripe is already on the
  // new price, the database step did not run, nothing refuses the move, and the
  // route answered a 500 — the outage — so pressing again replays the same
  // request and finishes it. The status is load-bearing, not decoration: a 4xx
  // with the money moved is a permanent no the refusal vocabulary deliberately
  // does not word (the RPC's group guard, raced into after Stripe moved), and
  // offering a retry for it would offer a press that can only fail again.
  const retryable =
    failure?.stripeUpdated === true &&
    commitRefusals.length === 0 &&
    failure.status >= 500;
  // The no-subscription move's permanent no with no refusal to name: the seat
  // moved elsewhere, a subscription appeared behind it, or the chosen group
  // stopped being the target's. Nothing moved, and another press meets the same
  // answer, so the confirm dies; only its 500 — the outage — invites one.
  const conflicted =
    noSubscription &&
    failure !== null &&
    commitRefusals.length === 0 &&
    failure.status >= 400 &&
    failure.status < 500;
  // The answer has to be about the move this sheet is showing. The route
  // decides the kind from the seat, so a seat whose subscription state changed
  // after the panel drew it is answered as the other kind — whose targets the
  // picker never offered, so that answer already carries a refusal. Requiring
  // the kinds to agree states the same thing directly: the sheet never commits
  // a move it did not describe.
  const answered =
    targetId !== null &&
    check.data?.kind === mode &&
    refusals.length === 0 &&
    commitRefusals.length === 0;
  const confirmDisabled = committing || conflicted || !(answered || retryable);

  // Each stage replaces the control the admin was standing on: picking a club
  // unmounts the row they pressed, and Back unmounts itself. Focus would fall
  // to the body, so the arriving stage takes it — on a stage CHANGE only, since
  // the sheet primitive owns focus when the sheet first opens.
  const searchRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const stage = targetId === null ? "picker" : "detail";
  const previousStage = useRef(stage);
  useEffect(() => {
    if (previousStage.current === stage) return;
    previousStage.current = stage;
    (stage === "detail" ? backRef.current : searchRef.current)?.focus();
  }, [stage]);

  const close = () => {
    if (!committing) onOpenChange(false);
  };

  const searchPlaceholder = noSubscription
    ? tn("searchPlaceholder")
    : t("searchPlaceholder");

  const handleConfirm = () => {
    if (targetId === null) return;
    // Live before any render after the click, and cleared only where the admin
    // has to press again — the success path closes the sheet, and the reset on
    // the next open is what ends the state there.
    setCommitting(true);
    onCommittingChange(true);
    setFailure(null);
    commit.mutate(
      { targetProductId: targetId, groupId, requestId },
      {
        onSuccess: () => {
          onCommittingChange(false);
          onOpenChange(false);
        },
        onError: (error) => {
          setCommitting(false);
          onCommittingChange(false);
          setFailure(
            error instanceof SwitchClubCommitError
              ? error
              : new SwitchClubCommitError(t("commit.failed"), {}),
          );
        },
      },
    );
  };

  const handleSelect = (id: string) => {
    setTargetId(id);
    // A group belongs to the club it is on, and the previous answer — and any
    // refusal a press came back with — belonged to a different club.
    setGroupId(null);
    setFailure(null);
  };

  const handleBack = () => {
    setTargetId(null);
    setGroupId(null);
    setFailure(null);
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      <SheetContent>
        <SheetHeader onClose={close}>
          <SheetTitle>{noSubscription ? tn("title") : t("title")}</SheetTitle>
          <SheetDescription>
            {noSubscription
              ? tn("description", { name: gamerName })
              : t("description", { name: gamerName })}
          </SheetDescription>
        </SheetHeader>

        {targetId === null ? (
          <div className="border-b border-border px-6 py-4">
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="pl-9"
              />
            </div>
          </div>
        ) : (
          <div className="border-b border-border px-6 py-4">
            <button
              ref={backRef}
              type="button"
              onClick={handleBack}
              disabled={committing}
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t("back")}
            </button>
          </div>
        )}

        <SheetBody>
          {targetId === null ? (
            <ClubList
              rows={rows}
              held={held}
              blocked={blocked}
              loading={productsLoading}
              empty={
                noSubscription
                  ? candidates.length === 0
                    ? tn("picker.empty")
                    : tn("picker.noMatch")
                  : candidates.length === 0
                    ? t("picker.empty")
                    : t("picker.noMatch")
              }
              locale={uiLocale}
              now={now}
              factsOf={factsOf}
              onSelect={handleSelect}
            />
          ) : (
            <div className="space-y-4">
              {target && targetStatus && (
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">
                      {resolveTranslation(target.product_translations, uiLocale)
                        ?.name ?? ""}
                    </p>
                    <ProductStatusChip status={targetStatus} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {factsOf(target)}
                  </p>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("group.label")}
                </p>
                {/* A fixed box the group list scrolls inside: how many groups
                    the target happens to run is not something the money block
                    below should move for. */}
                <div className="h-40 overflow-y-auto rounded-lg border border-border p-1">
                  <ul className="space-y-1">
                    <li>
                      <GroupOption
                        label={t("group.unassigned")}
                        detail={null}
                        selected={groupId === null}
                        disabled={committing}
                        onSelect={() => setGroupId(null)}
                      />
                    </li>
                    {(targetGroups.data?.groups ?? []).map((group) => (
                      <li key={group.id}>
                        <GroupOption
                          label={group.name}
                          detail={joinFacts([
                            group.gedus.map((g) => g.first_name).join(", "),
                            t("group.members", {
                              count: group.participations.length,
                            }),
                          ])}
                          selected={groupId === group.id}
                          disabled={committing}
                          onSelect={() => setGroupId(group.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* The money. A Stripe round trip fills this, so the skeleton is
                  immediate and the box already stands at its final height —
                  waiting for the answer and reading it happen without a pixel
                  below moving. */}
              {noSubscription ? (
                <NoSubscriptionLines
                  refusals={refusals}
                  isError={check.isError}
                />
              ) : (
              <div className="h-36 overflow-y-auto rounded-lg border border-border p-3">
                {check.isError ? (
                  <p className="text-sm text-muted-foreground">
                    {t("prices.error")}
                  </p>
                ) : refusals.length > 0 ? (
                  // Ahead of the skeleton: an answer of the other kind (the
                  // seat lost its subscription under the sheet) carries its
                  // refusal and no money, and must not read as still loading.
                  <RefusalList refusals={refusals} />
                ) : subscriptionCheck === undefined ? (
                  <div className="space-y-2">
                    <div className="h-4 w-24 animate-pulse rounded bg-lifted" />
                    <div className="h-7 w-56 animate-pulse rounded bg-lifted" />
                    <div className="h-4 w-full animate-pulse rounded bg-lifted" />
                    <div className="h-4 w-3/4 animate-pulse rounded bg-lifted" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-end gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {t("prices.current")}
                        </p>
                        <p className="text-lg font-semibold tabular-nums">
                          {formatAmount(
                            subscriptionCheck.currentAmountCents,
                            subscriptionCheck.currency,
                            uiLocale,
                          ) ?? t("prices.unavailable")}
                        </p>
                      </div>
                      <ArrowRight
                        className="mb-1.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {t("prices.target")}
                        </p>
                        <p className="text-lg font-semibold tabular-nums">
                          {formatAmount(
                            subscriptionCheck.targetAmountCents,
                            subscriptionCheck.currency,
                            uiLocale,
                          ) ?? t("prices.unavailable")}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {subscriptionCheck.settlement === "nothing_paid" &&
                      subscriptionCheck.nextChargeAt !== null
                        ? t("prices.nothingPaid", {
                            date: formatDate(
                              subscriptionCheck.nextChargeAt,
                              uiLocale,
                              { dateStyle: "medium", timeZone },
                            ),
                          })
                        : t("prices.proration")}
                    </p>
                  </div>
                )}
              </div>
              )}

              <TargetFactLines
                facts={facts}
                locale={uiLocale}
                timeZone={timeZone}
                name={gamerName}
                noSubscription={noSubscription}
                subscriptionEndsAt={subscriptionCheck?.subscriptionEndsAt ?? null}
              />

              {failure && (
                <Alert variant={retryable ? "warning" : "destructive"}>
                  <AlertDescription>
                    {/* Refusals win the wording: a named reason is what the
                        admin can act on, and the "press again" line would be a
                        lie beside one. Where the money moved anyway, the stuck
                        line is added UNDER the reason rather than replacing it
                        — the reason is what happened, and the money is what has
                        to be sorted out in Stripe on top of it. */}
                    {commitRefusals.length > 0 ? (
                      <>
                        {commitRefusals
                          .map((refusal) =>
                            t(`refusals.${REFUSAL_KEY[refusal]}`),
                          )
                          .join(" ")}
                        {failure.stripeUpdated && (
                          <span className="mt-2 block">
                            {t("commit.stripeUpdatedStuck")}
                          </span>
                        )}
                      </>
                    ) : failure.stripeUpdated ? (
                      // Money moved and no refusal to name: the outage invites
                      // the press, and the permanent 4xx says so instead of
                      // asking for one that cannot land.
                      retryable ? (
                        t("commit.stripeUpdated")
                      ) : (
                        t("commit.stripeUpdatedStuck")
                      )
                    ) : conflicted ? (
                      tn("commitConflict")
                    ) : noSubscription ? (
                      tn("commitFailed")
                    ) : (
                      t("commit.failed")
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </SheetBody>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={close} disabled={committing}>
            {c("cancel")}
          </Button>
          {/* Present from the moment the sheet opens, in both stages, so
              nothing lands in the footer after the fact — a confirm appearing
              on stage two would land on TOP of the mobile stack and push Cancel
              down. It is simply dead in stage one, where no club is chosen yet.
              The check is what enables it, and the one exception is the retry: a
              commit that updated Stripe and then failed to move the row for no
              stated reason leaves this live so the admin can press again with
              the same request id. A failure that DOES name a refusal — or that
              names a permanent reason of its own — is final, so it kills the
              confirm however far the money got. */}
          <Button onClick={handleConfirm} disabled={confirmDisabled}>
            {committing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {noSubscription ? tn("confirm") : t("confirm")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Stage one's list: the club's name, where it stands, and the one line that
 * tells two clubs of the same name apart — when it runs and when it starts.
 * Nothing is flagged here; what is worth knowing about a club is stated on the
 * second stage, about the one club that was chosen.
 *
 * The exceptions are dead ends, not flags: a club the gamer already holds a
 * place on (the unique index covers it, the commit refuses it), and — in the
 * no-subscription move — a club billed monthly, where a seat exists only behind
 * a subscription that checkout alone creates, and a product not open to the
 * seat holder's audience (a parent's own seat, a children's product, or the
 * reverse). A row that leads only to a
 * refusal is drawn disabled and says why. It keeps its ordered position — the
 * club is still where the admin expects to find it, it simply cannot be
 * pressed.
 */
function ClubList({
  rows,
  held,
  blocked,
  loading,
  empty,
  locale,
  now,
  factsOf,
  onSelect,
}: {
  rows: ProductWithDetails[];
  held: ReadonlySet<string>;
  blocked: ReadonlyMap<string, MoveBlock>;
  loading: boolean;
  empty: string;
  locale: SupportedLocale;
  now: Date;
  factsOf: (product: ProductWithDetails) => string;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("admin.products.groupsPanel.switchClub.picker");
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg border border-border bg-lifted"
          />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        // Held first: where both are true, the place the gamer already holds
        // is the nearer reason.
        const isHeld = held.has(row.id);
        const block = blocked.get(row.id);
        const disabledReason = isHeld
          ? t("alreadyHolds")
          : block !== undefined
            ? t(block)
            : null;
        const disabled = disabledReason !== null;
        return (
          <li key={row.id}>
            <button
              type="button"
              disabled={disabled}
              aria-disabled={disabled}
              onClick={() => onSelect(row.id)}
              className={cn(
                "w-full rounded-lg border border-border p-3 text-left transition-colors",
                disabled ? "cursor-default opacity-60" : "hover:bg-hover",
              )}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate font-medium">
                  {resolveTranslation(row.product_translations, locale)?.name ??
                    ""}
                </span>
                {/* One pill in this slot, never two: a disabled row's reason
                    REPLACES the status chip rather than joining it, because
                    where a club is a dead end for this gamer its lifecycle
                    state is not what the row is about, and a row that grew a
                    second pill would be the one row wider than all the others.
                    The two wear the same pill geometry — same border, same text
                    size, same vertical padding — so the swap when the
                    participations read lands changes the word, not the row's
                    height. */}
                <span className="shrink-0">
                  {disabledReason !== null ? (
                    <Badge variant="outline">{disabledReason}</Badge>
                  ) : (
                    <ProductStatusChip status={effectiveStatus(row, now)} />
                  )}
                </span>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {factsOf(row)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The no-subscription move's second stage, in place of the money: what the
 * family experiences, said plainly, because the move charges and refunds
 * nothing whatever either product costs. Each line is one an admin could
 * repeat to the parent unchanged, except the price-difference line — the
 * sanctioned exception, an instruction that sends the admin to Stripe.
 *
 * A refusal from the check replaces the lines — a different panel, not a line
 * joining them — because a move that cannot happen has nothing for the family
 * to experience.
 */
function NoSubscriptionLines({
  refusals,
  isError,
}: {
  refusals: readonly SwitchClubRefusal[];
  isError: boolean;
}) {
  const t = useTranslations("admin.products.groupsPanel.switchClub");
  const tn = useTranslations(
    "admin.products.groupsPanel.switchClub.noSubscription.family",
  );

  if (isError) {
    return <p className="text-sm text-muted-foreground">{t("prices.error")}</p>;
  }
  if (refusals.length > 0) return <RefusalList refusals={refusals} />;

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {tn("label")}
      </p>
      <ul className="space-y-1.5 text-sm text-foreground">
        <li>{tn("money")}</li>
        <li>{tn("priceDifference")}</li>
        <li>{tn("email")}</li>
        <li>{tn("consents")}</li>
      </ul>
    </div>
  );
}

/** The check's hard refusals, one line each with the mark in the danger tone. */
function RefusalList({ refusals }: { refusals: readonly SwitchClubRefusal[] }) {
  const t = useTranslations("admin.products.groupsPanel.switchClub");
  return (
    <ul className="space-y-2">
      {refusals.map((refusal) => (
        <li
          key={refusal}
          className="flex items-start gap-2 text-sm text-foreground"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
            aria-hidden
          />
          {t(`refusals.${REFUSAL_KEY[refusal]}`)}
        </li>
      ))}
    </ul>
  );
}

/**
 * The chosen club's own facts, under the money — plain muted lines, not an
 * alert and not warning-toned. None of them stops anything: the admin knows the
 * family, and the switch enforces none of these.
 *
 * **The block is at its final height from the first render of the stage.** The
 * seat line is the one fact waiting on a round trip, and it is present with
 * nothing in it until the snapshot lands, so the count arriving moves no pixel.
 * Its space is not reserved speculatively: an uncapped club has no seat line at
 * all and no hole where one would go.
 */
function TargetFactLines({
  facts,
  locale,
  timeZone,
  name,
  noSubscription,
  subscriptionEndsAt,
}: {
  facts: SwitchTargetFact[];
  locale: SupportedLocale;
  timeZone: string;
  name: string;
  /** The no-subscription move, whose not-started line says nothing about paying. */
  noSubscription: boolean;
  /**
   * When the family has already cancelled, the instant the subscription runs
   * out. Never a refusal — an admin may well be switching the club of a family
   * who cancelled and changed their mind — so the confirm stays live and this
   * is one more line of the block.
   */
  subscriptionEndsAt: string | null;
}) {
  const t = useTranslations("admin.products.groupsPanel.switchClub.facts");
  const tn = useTranslations(
    "admin.products.groupsPanel.switchClub.noSubscription",
  );

  if (facts.length === 0 && subscriptionEndsAt === null) return null;

  return (
    <div className="space-y-1">
      {facts.map((fact) => (
        <p key={fact.kind} className="min-h-5 text-sm text-muted-foreground">
          {fact.kind === "notStarted" && noSubscription
            ? tn("notStarted", { date: formatDateOnly(fact.startDate, locale) })
            : factLine(fact, t, locale, name)}
        </p>
      ))}
      {/* The one line waiting on the check's round trip, and therefore the LAST
          one: it joins the end of the run, where the container's slack already
          sits, so nothing already painted moves when it arrives. Order is
          load-bearing here — a tidy-up that sorted these lines by topic would
          reintroduce the shift silently. */}
      {subscriptionEndsAt !== null && (
        <p className="text-sm text-muted-foreground">
          {t("subscriptionEnding", {
            date: formatDate(subscriptionEndsAt, locale, {
              dateStyle: "medium",
              timeZone,
            }),
          })}
        </p>
      )}
    </div>
  );
}

/**
 * One fact as its sentence. The age range is one message with a `select` on
 * which ends are authored, so each locale words an open-ended range as its own
 * grammar wants rather than gluing two translated fragments together.
 */
function factLine(
  fact: SwitchTargetFact,
  t: ReturnType<typeof useTranslations<"admin.products.groupsPanel.switchClub.facts">>,
  locale: SupportedLocale,
  name: string,
): string {
  switch (fact.kind) {
    case "ageRange": {
      const values = {
        ends:
          fact.minAge !== null && fact.maxAge !== null
            ? "both"
            : fact.minAge !== null
              ? "from"
              : "to",
        min: fact.minAge ?? 0,
        max: fact.maxAge ?? 0,
      };
      return fact.gamerAge === null
        ? t("ageRange", values)
        : t("ageRangeWithGamer", { ...values, name, age: fact.gamerAge });
    }
    case "seats":
      return fact.taken === null
        ? ""
        : t("seats", { taken: fact.taken, capacity: fact.capacity });
    case "regionLocked":
      return t("regionLocked", {
        country: countryDisplayName(fact.country, locale),
      });
    case "notStarted":
      return t("notStarted", { date: formatDateOnly(fact.startDate, locale) });
  }
}

/** One row of the group radio list, including the unassigned default. */
function GroupOption({
  label,
  detail,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  detail: string | null;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-md border border-border p-2 transition-colors",
        selected && "border-act",
        disabled && "opacity-50",
      )}
    >
      <input
        type="radio"
        name="switchClubGroup"
        className="mt-1 accent-act"
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        {detail && (
          <span className="block truncate text-xs text-muted-foreground">
            {detail}
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * One amount, in the subscription's own currency — null where there is nothing
 * to draw: a tiered price carries no flat amount, and a target with no authored
 * price in that currency has none either (which is also a hard refusal, so the
 * admin reads the reason rather than a blank).
 *
 * The currency is guarded rather than cast: it arrives as a bare string from
 * the wire, and the shared formatter's argument is the supported set on
 * purpose.
 */
function formatAmount(
  cents: number | null,
  currency: string,
  locale: string,
): string | null {
  if (cents === null || !isSupportedCurrency(currency)) return null;
  return formatCurrencyFromCents(cents, currency, locale);
}
