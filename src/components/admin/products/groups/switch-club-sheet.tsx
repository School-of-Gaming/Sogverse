"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  cn,
  formatCurrencyFromCents,
  formatDate,
  formatDateOnly,
} from "@/lib/utils";
import { useNow, useTimezone } from "@/providers";
import { useProductGroups } from "@/services/groups";
import { useProductsByType, type ProductWithDetails } from "@/services/products";
import {
  SwitchClubCommitError,
  useSwitchClub,
  useSwitchClubCheck,
} from "@/services/participations";
import type { SwitchClubRefusal } from "@/services/participations/switch-club.contracts";
import { filterProductsBySearch } from "../product-name-search";
import { ProductStatusChip } from "../product-status-chip";
import {
  isSwitchTarget,
  orderSwitchTargets,
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
} as const satisfies Record<SwitchClubRefusal, string>;

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
  /** The seat holder's first name, woven into the sheet's description. */
  gamerName: string;
  /**
   * The seat holder's age today, or null on an adult seat, which carries no
   * date of birth. Stated beside the target's own age range on stage two.
   */
  gamerAge: number | null;
  /**
   * Told whenever the commit starts or fails, so the panel can mark the chip
   * busy for as long as money is moving. Not derived from the mutation's own
   * pending flag: that clears before the sheet closes, and a chip that un-greys
   * a frame early is a chip an admin can start dragging mid-switch.
   */
  onCommittingChange: (committing: boolean) => void;
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
  gamerName,
  gamerAge,
  onCommittingChange,
}: SwitchClubSheetProps) {
  const t = useTranslations("admin.products.groupsPanel.switchClub");
  const c = useTranslations("common");
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
  const { data: products, isLoading: productsLoading } = useProductsByType(
    "consumer_club",
    { enabled: hasOpened },
  );
  const check = useSwitchClubCheck(productId, participationId, targetId);
  const commit = useSwitchClub(productId, participationId);
  // The target's own seating, read the moment a club is chosen — the same
  // admin-readable snapshot this panel is drawn from. It answers both of stage
  // two's questions: which groups the seat can be put in, and how full the club
  // already is.
  const targetGroups = useProductGroups(targetId ?? "");

  const source = products?.find((p) => p.id === productId) ?? null;
  const target = products?.find((p) => p.id === targetId) ?? null;

  const candidates = useMemo(
    () => (products ?? []).filter((p) => isSwitchTarget(p, productId)),
    [products, productId],
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
        schedule.kind === "recurring" ? joinScheduleGroups(schedule.groups) : "",
        product.start_date === null
          ? ""
          : formatDateOnly(product.start_date, uiLocale),
      ]);
    };
  }, [uiLocale, timeZone, now]);

  const rows = useMemo(
    () => orderSwitchTargets(filterProductsBySearch(candidates, search), source),
    [candidates, search, source],
  );

  // The chosen club's own facts, stated as information under the money. The
  // seat count is the only one that arrives after the stage does, and it is
  // present as a fact from the first render (with nothing in it yet), so the
  // block stands at its final height before the snapshot lands.
  const facts: SwitchTargetFact[] =
    target === null
      ? []
      : switchTargetFacts(
          {
            status: target.status,
            minAge: target.min_age,
            maxAge: target.max_age,
            regionLockCountry: target.region_lock_country,
            startDate: target.start_date,
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
  const answered =
    targetId !== null &&
    check.data !== undefined &&
    refusals.length === 0 &&
    commitRefusals.length === 0;
  const confirmDisabled = committing || !(answered || retryable);

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
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>
            {t("description", { name: gamerName })}
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
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
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
              loading={productsLoading}
              empty={
                candidates.length === 0 ? t("picker.empty") : t("picker.noMatch")
              }
              locale={uiLocale}
              now={now}
              factsOf={factsOf}
              onSelect={handleSelect}
            />
          ) : (
            <div className="space-y-4">
              {target && (
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">
                      {resolveTranslation(target.product_translations, uiLocale)
                        ?.name ?? ""}
                    </p>
                    <ProductStatusChip status={effectiveStatus(target, now, 0)} />
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
              <div className="h-36 overflow-y-auto rounded-lg border border-border p-3">
                {check.isError ? (
                  <p className="text-sm text-muted-foreground">
                    {t("prices.error")}
                  </p>
                ) : check.data === undefined ? (
                  <div className="space-y-2">
                    <div className="h-4 w-24 animate-pulse rounded bg-lifted" />
                    <div className="h-7 w-56 animate-pulse rounded bg-lifted" />
                    <div className="h-4 w-full animate-pulse rounded bg-lifted" />
                    <div className="h-4 w-3/4 animate-pulse rounded bg-lifted" />
                  </div>
                ) : refusals.length > 0 ? (
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
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-end gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {t("prices.current")}
                        </p>
                        <p className="text-lg font-semibold tabular-nums">
                          {formatAmount(
                            check.data.currentAmountCents,
                            check.data.currency,
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
                            check.data.targetAmountCents,
                            check.data.currency,
                            uiLocale,
                          ) ?? t("prices.unavailable")}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("prices.proration")}
                    </p>
                  </div>
                )}
              </div>

              <TargetFactLines
                facts={facts}
                locale={uiLocale}
                timeZone={timeZone}
                name={gamerName}
                subscriptionEndsAt={check.data?.subscriptionEndsAt ?? null}
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
            {t("confirm")}
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
 */
function ClubList({
  rows,
  loading,
  empty,
  locale,
  now,
  factsOf,
  onSelect,
}: {
  rows: ProductWithDetails[];
  loading: boolean;
  empty: string;
  locale: SupportedLocale;
  now: Date;
  factsOf: (product: ProductWithDetails) => string;
  onSelect: (id: string) => void;
}) {
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
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={() => onSelect(row.id)}
            className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-hover"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="font-medium">
                {resolveTranslation(row.product_translations, locale)?.name ??
                  ""}
              </span>
              <ProductStatusChip status={effectiveStatus(row, now, 0)} />
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {factsOf(row)}
            </span>
          </button>
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
  subscriptionEndsAt,
}: {
  facts: SwitchTargetFact[];
  locale: SupportedLocale;
  timeZone: string;
  name: string;
  /**
   * When the family has already cancelled, the instant the subscription runs
   * out. Never a refusal — an admin may well be switching the club of a family
   * who cancelled and changed their mind — so the confirm stays live and this
   * is one more line of the block.
   */
  subscriptionEndsAt: string | null;
}) {
  const t = useTranslations("admin.products.groupsPanel.switchClub.facts");

  if (facts.length === 0 && subscriptionEndsAt === null) return null;

  return (
    <div className="space-y-1">
      {facts.map((fact) => (
        <p key={fact.kind} className="min-h-5 text-sm text-muted-foreground">
          {factLine(fact, t, locale, name)}
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
      return fact.startDate === null
        ? t("notStartedUndated")
        : t("notStarted", { date: formatDateOnly(fact.startDate, locale) });
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
