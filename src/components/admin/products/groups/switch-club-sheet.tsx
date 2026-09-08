"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Search,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FilterCombobox } from "@/components/ui/filter-combobox";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { Input } from "@/components/ui/input";
import { LanguageFlag } from "@/components/ui/language-flag";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useLanguageNames } from "@/hooks/use-language-names";
import {
  resolveLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { isSupportedCurrency } from "@/lib/constants/currency";
import { SPOKEN_LANGUAGES } from "@/lib/constants/spoken-languages";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { effectiveStatus } from "@/lib/products/effective-status";
import {
  formatProductSchedule,
  formatWeekday,
  joinScheduleGroups,
} from "@/lib/products/format-product-schedule";
import { cn, formatCurrencyFromCents, formatDateOnly } from "@/lib/utils";
import { useNow, useTimezone } from "@/providers";
import { useProductGroups } from "@/services/groups";
import { useProductsByType, type ProductWithDetails } from "@/services/products";
import { useUsersByRole } from "@/services/users";
import {
  SwitchClubCommitError,
  useSwitchClub,
  useSwitchClubCheck,
} from "@/services/participations";
import type { SwitchClubRefusal } from "@/services/participations/switch-club.contracts";
import { filterClubProducts } from "../club-product-filter";
import { ProductStatusChip } from "../product-status-chip";
import {
  isSwitchTarget,
  isSwitchTargetFull,
  orderSwitchTargets,
  switchTargetWarnings,
  type SwitchTargetWarning,
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

const WARNING_KEY = {
  regionLocked: "regionLocked",
  notStarted: "notStarted",
  full: "full",
} as const satisfies Record<SwitchTargetWarning, string>;

interface SwitchClubSheetProps {
  /** The product the seat is on today — half of the route's path. */
  productId: string;
  participationId: string;
  /** The seat holder's first name, woven into the sheet's description. */
  gamerName: string;
  /**
   * Told whenever the commit starts or fails, so the panel can mark the chip
   * busy for as long as money is moving. Not derived from the mutation's own
   * pending flag: that clears before the sheet closes, and a chip that un-greys
   * a frame early is a chip an admin can start dragging mid-switch.
   */
  onCommittingChange: (committing: boolean) => void;
  onClose: () => void;
}

/**
 * Move a subscribed seat to another consumer club, swapping the family's Stripe
 * subscription onto that club's canonical price in the same action — and
 * placing the seat in one of the target's groups on the way.
 *
 * **Two stages in one sheet.** Finding the club is a search problem: names
 * repeat across languages and terms, fifty clubs run at once, and a scrolling
 * list of names cannot be read. So stage one is the admin club list's own bar —
 * search plus weekday, educator and language, through the predicate that page
 * shares — over rows carrying the facts that tell two same-named clubs apart.
 * Stage two is about one club: its summary, where in it the gamer sits, and
 * what changes for the family's money.
 *
 * Warnings never disable the confirm; refusals always do, because every one of
 * them is a state that has to be settled in Stripe before a switch can mean
 * anything.
 */
export function SwitchClubSheet({
  productId,
  participationId,
  gamerName,
  onCommittingChange,
  onClose,
}: SwitchClubSheetProps) {
  const t = useTranslations("admin.products.groupsPanel.switchClub");
  const tProducts = useTranslations("admin.products");
  const c = useTranslations("common");
  const uiLocale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const now = useNow();
  const languageName = useLanguageNames();

  const [search, setSearch] = useState("");
  const [weekday, setWeekday] = useState<string | null>(null);
  const [geduId, setGeduId] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [failure, setFailure] = useState<SwitchClubCommitError | null>(null);

  // One request id for the life of this sheet, minted in a lazy initializer so
  // it survives every re-render (and a double-invoked render in development) —
  // and going back to the list and forward again, which is one open. Every
  // press carries it, which is what makes a retry after a timeout or a failed
  // database step replay one Stripe request rather than prorate twice; a fresh
  // open is a fresh id, and the route's no-op item update is the second line of
  // defence there.
  const [requestId] = useState(() => crypto.randomUUID());

  const { data: products, isLoading: productsLoading } =
    useProductsByType("consumer_club");
  const { data: gedus } = useUsersByRole("gedu");
  const check = useSwitchClubCheck(productId, participationId, targetId);
  const commit = useSwitchClub(productId, participationId);
  // The target's own seating, read the moment a club is chosen — the same
  // admin-readable snapshot this panel is drawn from. It answers both of stage
  // two's questions: which groups the seat can be put in, and whether the club
  // has a seat left at all.
  const targetGroups = useProductGroups(targetId ?? "");

  const source = products?.find((p) => p.id === productId) ?? null;
  const target = products?.find((p) => p.id === targetId) ?? null;

  const candidates = useMemo(
    () => (products ?? []).filter((p) => isSwitchTarget(p, productId)),
    [products, productId],
  );

  // Each filter offers only values some candidate actually carries, exactly as
  // the club list's bar does — a control that can only empty the list is not
  // worth a row of the header.
  const weekdayOptions = useMemo(() => {
    const present = new Set<number>();
    for (const p of candidates) {
      for (const slot of p.schedule_slots) present.add(slot.weekday);
    }
    return [...present]
      .sort((a, b) => a - b)
      .map((w) => ({
        value: String(w),
        label: formatWeekday(w, uiLocale, "long"),
      }));
  }, [candidates, uiLocale]);

  const geduOptions = useMemo(() => {
    const present = new Set<string>();
    for (const p of candidates) {
      for (const a of p.gedu_group_assignments) present.add(a.gedu_id);
    }
    const nameById = new Map(
      (gedus ?? []).map((g) => [
        g.id,
        [g.first_name, g.last_name].filter(Boolean).join(" ") || g.first_name,
      ]),
    );
    return [...present]
      .map((id) => ({ value: id, label: nameById.get(id) ?? id }))
      .sort((a, b) => a.label.localeCompare(b.label, uiLocale));
  }, [candidates, gedus, uiLocale]);

  const languageOptions = useMemo(() => {
    const present = new Set(candidates.map((p) => p.spoken_language_code));
    // The enum's own declaration order, like every other language control,
    // rather than an alphabetical order that changes with the viewer's locale.
    return SPOKEN_LANGUAGES.filter((code) => present.has(code)).map((code) => {
      const name = languageName(code);
      return {
        value: code,
        label: name,
        adornment: <LanguageFlag code={code} showCode={false} title={name} />,
      };
    });
  }, [candidates, languageName]);

  const geduFirstNames = useMemo(() => {
    const byId = new Map((gedus ?? []).map((g) => [g.id, g.first_name]));
    return (product: ProductWithDetails) => {
      const names = new Set<string>();
      for (const a of product.gedu_group_assignments) {
        const name = byId.get(a.gedu_id);
        if (name) names.add(name);
      }
      return [...names];
    };
  }, [gedus]);

  // One line of facts per row, and the same line again above the group list in
  // stage two — the club an admin picked has to be recognisable as the club
  // they were reading a moment earlier, so the two are one function.
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
        languageName(product.spoken_language_code),
        geduFirstNames(product).join(", "),
        product.start_date === null
          ? ""
          : formatDateOnly(product.start_date, uiLocale),
      ]);
    };
  }, [uiLocale, timeZone, now, languageName, geduFirstNames]);

  const rows = useMemo(() => {
    const narrowed = filterClubProducts(candidates, {
      search,
      weekday: weekday === null ? null : Number(weekday),
      geduId,
      language,
    });
    return orderSwitchTargets(narrowed, source);
  }, [candidates, search, weekday, geduId, language, source]);

  const targetWarnings: SwitchTargetWarning[] =
    target === null
      ? []
      : [
          ...switchTargetWarnings({
            status: target.status,
            regionLockCountry: target.region_lock_country,
          }),
          ...(isSwitchTargetFull(targetGroups.data, target.seat_count)
            ? (["full"] as const)
            : []),
        ];

  const refusals = check.data?.refusals ?? [];
  // A failure carrying refusals is a gate that moved under the admin between the
  // check and the press; it kills the confirm until they pick another club,
  // exactly as a refusal from the check does. Pressing again cannot change the
  // fact behind it, so it must never be offered as a retry — even when the
  // money moved first.
  const commitRefusals = failure?.refusals ?? [];
  // The one failure the admin can act on from here: Stripe is already on the
  // new price, the database step did not run, and nothing refuses the move — so
  // pressing again replays the same request and finishes it.
  const retryable =
    failure?.stripeUpdated === true && commitRefusals.length === 0;
  const answered =
    targetId !== null &&
    check.data !== undefined &&
    refusals.length === 0 &&
    commitRefusals.length === 0;
  const confirmDisabled = committing || !(answered || retryable);

  const handleConfirm = () => {
    if (targetId === null) return;
    // Live before any render after the click, and cleared only where the admin
    // has to press again — the success path closes the sheet, and the unmount
    // is what ends the state there.
    setCommitting(true);
    onCommittingChange(true);
    setFailure(null);
    commit.mutate(
      { targetProductId: targetId, groupId, requestId },
      {
        onSuccess: () => {
          onCommittingChange(false);
          onClose();
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
    <Sheet open onOpenChange={(open) => !open && !committing && onClose()}>
      <SheetContent>
        <SheetHeader onClose={() => !committing && onClose()}>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>
            {t("description", { name: gamerName })}
          </SheetDescription>
        </SheetHeader>

        {targetId === null ? (
          <div className="space-y-3 border-b border-border px-6 py-4">
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                className="pl-9"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FilterDropdown
                label={tProducts("filters.day")}
                allLabel={tProducts("filters.allDays")}
                options={weekdayOptions}
                value={weekday}
                onChange={setWeekday}
              />
              <FilterCombobox
                label={tProducts("filters.gedu")}
                placeholder={tProducts("filters.searchGedu")}
                options={geduOptions}
                value={geduId}
                onChange={setGeduId}
                noResultsLabel={tProducts("filters.noResults")}
              />
              <FilterDropdown
                label={tProducts("filters.language")}
                allLabel={tProducts("filters.allLanguages")}
                options={languageOptions}
                value={language}
                onChange={setLanguage}
              />
            </div>
          </div>
        ) : (
          <div className="border-b border-border px-6 py-4">
            <button
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
                    <ProductStatusChip
                      status={effectiveStatus(target, now, 0)}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {factsOf(target)}
                  </p>
                  <WarningLines
                    warnings={targetWarnings}
                    label={(warning) => t(`warnings.${WARNING_KEY[warning]}`)}
                  />
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
                      t("commit.stripeUpdated")
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
          <Button variant="outline" onClick={onClose} disabled={committing}>
            {c("cancel")}
          </Button>
          {/* Present from the moment stage two opens, so nothing lands in the
              footer after the fact. The check is what enables it, and the one
              exception is the retry: a commit that updated Stripe and then
              failed to move the row for no stated reason leaves this live so
              the admin can press again with the same request id. A failure that
              DOES name a refusal is permanent, so it kills the confirm however
              far the money got. */}
          {targetId !== null && (
            <Button onClick={handleConfirm} disabled={confirmDisabled}>
              {committing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {t("confirm")}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Stage one's list. Each row carries what tells two clubs of the same name
 * apart — when it runs, in what language, with whom, and from when — plus the
 * warnings derivable without reading the club's own seating.
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
  const t = useTranslations("admin.products.groupsPanel.switchClub");

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg border border-border bg-lifted"
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
        const warnings = switchTargetWarnings({
          status: row.status,
          regionLockCountry: row.region_lock_country,
        });
        return (
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
              <WarningLines
                warnings={warnings}
                label={(warning) => t(`warnings.${WARNING_KEY[warning]}`)}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The warning run under a club, drawn identically in both stages. */
function WarningLines({
  warnings,
  label,
}: {
  warnings: SwitchTargetWarning[];
  label: (warning: SwitchTargetWarning) => string;
}) {
  if (warnings.length === 0) return null;
  return (
    <span className="mt-1 flex flex-col gap-0.5">
      {warnings.map((warning) => (
        <span
          key={warning}
          className="flex items-center gap-1 text-xs font-normal text-warning"
        >
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
          {label(warning)}
        </span>
      ))}
    </span>
  );
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
