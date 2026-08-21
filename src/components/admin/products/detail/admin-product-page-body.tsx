"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  CalendarCheck,
  Check,
  Copy,
  Hourglass,
  Link2,
  Mail,
  NotebookPen,
  Pencil,
  Radio,
  Ticket,
  UserCog,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardSectionPill } from "@/components/layout/dashboard-section-pill";
import { LongDescription } from "@/components/public/products/long-description";
import { ProductOverviewCard } from "@/components/public/products/product-overview-card";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";
import { CopyAllEmailsButton } from "@/components/gedu/session-details/roster-helpers";
import type { GroupNotesDraft } from "@/components/gedu/session-details/GroupNotesPanel";
import type { SiteNotesDraft } from "@/components/gedu/session-details/SiteNotesPanel";
import type {
  SessionEntryDraft,
  SessionReportSendResult,
} from "@/components/gedu/session-feed";
import { PRODUCT_TYPE_PRESENTATION } from "@/components/admin/dashboard/product-type-presentation";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn, formatDate } from "@/lib/utils";
import { computeVoiceState } from "@/lib/voice-window";
import { useTimezone } from "@/providers";
import type { GroupsPanelActions } from "../groups/groups-panel-view";
import type { ParticipantChipDetails } from "../groups/participant-chip";
import type { GroupPending } from "@/services/groups";
import type { RobloxRenderMap } from "@/services/roblox";
import type { GroupParticipationDetail } from "@/types";
import { joinParts } from "../join-parts";
import { PRODUCT_TYPE_CONFIG } from "../product-type-config";
import { ProductStatusChip } from "../product-status-chip";
import { Fact, FactGrid } from "./admin-product-fact";
import { AdminProductPeople } from "./admin-product-people";
import { AdminProductSessions } from "./admin-product-sessions";
import {
  AdminProductHowItRuns,
  AdminProductMoney,
} from "./admin-product-setup-sections";
import {
  ADMIN_PRODUCT_SECTIONS,
  type AdminProductDetail,
} from "./admin-product-detail-data";

/**
 * The **draft** admin product page: one long page, six sections, a sticky pill
 * to move between them.
 *
 * The principle it is built to: *everything stored about this product is
 * readable here, plus everything a gedu sees, plus the facts derived from them —
 * and Edit is only for changing.* The live page shows about half the columns and
 * none of the gedu side at all, which is why admins have been creating second
 * gedu accounts and assigning them to groups in order to read a session report.
 *
 * **A long page with a section pill, not tabs.** Tabs would be the obvious
 * answer to six sections and they are the wrong one twice over: they hide five
 * sixths of the page from a reader who does not yet know which sixth they want,
 * and they make the browser's own find-in-page useless on the one surface where
 * "which of these forty children is Aino" is a real question. The pill is
 * navigation over a page that is all there.
 *
 * **The order is fixed and is an argument.** Derived facts first, because they
 * answer the questions actually asked (where is the link, when is the next one,
 * is it full, why does it say pending). Then what a family sees, because an
 * admin's second question is nearly always "what does this look like from
 * outside". Then the two blocks of stored configuration. Then people, then what
 * happened — the two heaviest sections, at the bottom, where their scroll costs
 * nothing above them.
 *
 * **There are no status actions and there should never be any.** Status is
 * derived from the dates and the threshold; a button that "started" a product
 * would be writing a fact the derivation is about to overrule.
 *
 * Presentational end to end. Every fact arrives in `data`, every action is a
 * callback, and the only clocks it reads are the shared providers — which is
 * what lets the preview scene and (after promotion) the live route render the
 * same body.
 */
export function AdminProductPageBody({
  data,
  pending,
  robloxRenders,
  deriveAvatars,
  chipDetails,
  groupActions,
  siteNotesEditing,
  onSiteNotesEditingChange,
  onSaveSiteNotes,
  editingGroupNotesId,
  onEditingGroupNotesChange,
  onSaveGroupNotes,
  feedNow,
  editingEntryId,
  onEditEntry,
  onSaveEntry,
  onSendReport,
}: {
  data: AdminProductDetail;
  pending: GroupPending;
  robloxRenders?: RobloxRenderMap;
  /**
   * Let a chip's platform derive its figure from the username, as the live shell
   * does. A fixture-driven shell passes `false` — see the seating view's note;
   * on Minecraft the *absence* of a URL is what makes the row fetch one.
   */
  deriveAvatars?: boolean;
  chipDetails?: (participation: GroupParticipationDetail) => ParticipantChipDetails;
  groupActions: GroupsPanelActions;
  siteNotesEditing: boolean;
  onSiteNotesEditingChange: (editing: boolean) => void;
  onSaveSiteNotes: (draft: SiteNotesDraft) => void | Promise<void>;
  editingGroupNotesId: string | null;
  onEditingGroupNotesChange: (groupId: string | null) => void;
  onSaveGroupNotes: (groupId: string, draft: GroupNotesDraft) => void | Promise<void>;
  /**
   * The instant the session entries were built from.
   *
   * **Deliberately not this component's own `useNow()`**, which keeps ticking so
   * the voice window below cannot lie about whether a room is open. The feed's
   * clock is the caller's because the caller is what freezes it while a session
   * editor is open — two clocks on this page on purpose, and the split is which
   * of them may be stopped.
   */
  feedNow: Date;
  editingEntryId: string | null;
  onEditEntry: (entryId: string | null) => void;
  onSaveEntry: (entryId: string, draft: SessionEntryDraft) => void | Promise<void>;
  onSendReport: (entryId: string) => Promise<SessionReportSendResult>;
}) {
  const t = useTranslations("admin.products");
  const c = useTranslations("common");
  const locale = useLocale();
  const uiLocale = resolveLocale(locale);
  const timeZone = useTimezone();

  const { product } = data;
  const config = PRODUCT_TYPE_CONFIG[product.product_type];
  const presentation = PRODUCT_TYPE_PRESENTATION[product.product_type];
  const TypeIcon = presentation.icon;
  const tr = resolveTranslation(product.product_translations, uiLocale);

  // Every group on the product shares one schedule, so the voice window is
  // resolved once here and threaded into each group's Join button. A room only
  // exists for a remote product with a session still ahead of it.
  const voice = computeVoiceState({
    product,
    now: feedNow,
    locale,
    timeZone,
  });
  const voiceAvailable = product.is_remote && voice.hasUpcomingSession;

  const sections = useMemo(
    () =>
      ADMIN_PRODUCT_SECTIONS.map((id) => ({
        id,
        label: t(`detail.sections.${id}`),
      })),
    [t],
  );

  const listHref = `/admin/${config.routeSlug}`;
  const editHref = `/admin/${config.routeSlug}/${product.id}/edit`;
  const cloneHref = `/admin/${config.routeSlug}/new?cloneFrom=${product.id}`;

  return (
    <div className="space-y-6">
      <Link
        href={listHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("detail.backToCatalogue")}
      </Link>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span
            className={cn(
              "mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              presentation.tint,
            )}
          >
            <TypeIcon aria-hidden className={cn("h-5 w-5", presentation.text)} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t(`types.${presentation.i18nKey}.label`)}
            </p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight">
              {tr?.name ?? t("list.untitled")}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ProductStatusChip status={data.status} />
              <Badge variant={product.is_visible ? "default" : "secondary"}>
                {product.is_visible
                  ? t("detailsPage.listed")
                  : t("detailsPage.unlisted")}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href={cloneHref} className={buttonVariants({ variant: "outline" })}>
            <Copy className="mr-1 h-4 w-4" />
            {c("clone")}
          </Link>
          <Link href={editHref} className={buttonVariants()}>
            <Pencil className="mr-1 h-4 w-4" />
            {c("edit")}
          </Link>
        </div>
      </div>

      <DashboardSectionPill
        sections={sections}
        ariaLabel={t("detail.sectionNavAria")}
      />

      {/* ── At a glance ────────────────────────────────────────────────── */}
      <Section id="at-a-glance" title={t("detail.sections.at-a-glance")}>
        <Card>
          <CardContent className="space-y-5 p-5 sm:p-6">
            <FactGrid>
              <Fact icon={Link2} label={t("detail.fields.publicLink")}>
                <PublicLink url={data.publicUrl} />
              </Fact>

              <Fact icon={CalendarCheck} label={t("detail.fields.nextSession")}>
                {data.nextSession === null ? (
                  <span className="text-muted-foreground">
                    {t("detail.noNextSession")}
                  </span>
                ) : (
                  <span className="flex flex-wrap items-center gap-2">
                    {formatDate(data.nextSession.startsAt, uiLocale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone,
                    })}
                    {data.nextSession.isLive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-info/15 px-2 py-0.5 text-xs font-medium text-info">
                        <Radio aria-hidden className="h-3 w-3" />
                        {t("detail.liveNow")}
                      </span>
                    )}
                  </span>
                )}
              </Fact>

              <Fact icon={Hourglass} label={t("detail.fields.term")}>
                {data.sessionsRemaining === null
                  ? t("detail.sessionsRunOpenEnded", { run: data.sessionsRun })
                  : t("detail.sessionsRunOf", {
                      run: data.sessionsRun,
                      remaining: data.sessionsRemaining,
                    })}
              </Fact>

              <Fact icon={NotebookPen} label={t("detail.fields.writeUps")}>
                <span
                  className={cn(
                    data.sessionsWrittenUp < data.sessionsRun && "text-warning",
                  )}
                >
                  {t("detail.writtenUpOf", {
                    written: data.sessionsWrittenUp,
                    run: data.sessionsRun,
                  })}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {t("detail.emailedCount", { count: data.sessionsEmailed })}
                </span>
              </Fact>

              <Fact icon={Ticket} label={t("detailsPage.fields.seats")}>
                <p>
                  {data.seats.free === null
                    ? t("catalogue.seatsUncapped", { filled: data.seats.filled })
                    : t("detail.seatsFilledFree", {
                        filled: data.seats.filled,
                        free: data.seats.free,
                      })}
                </p>
                {(data.seats.waitlisted > 0 || data.seats.unplaced > 0) && (
                  <p className="text-xs text-muted-foreground">
                    {joinParts([
                      data.seats.waitlisted > 0
                        ? t("catalogue.waitingCount", {
                            count: data.seats.waitlisted,
                          })
                        : null,
                      data.seats.unplaced > 0
                        ? t("catalogue.unplacedCount", {
                            count: data.seats.unplaced,
                          })
                        : null,
                    ])}
                  </p>
                )}
              </Fact>

              <Fact icon={Hourglass} label={t("detail.fields.statusReason")}>
                {data.statusReason ?? (
                  <span className="text-muted-foreground">
                    {t(`status.${data.status}`)}
                  </span>
                )}
              </Fact>

              <Fact icon={UserCog} label={t("detail.fields.created")}>
                {t("detail.byWhoWhen", {
                  name: data.createdBy.name,
                  when: formatDate(data.createdBy.at, uiLocale, {
                    dateStyle: "medium",
                    timeZone,
                  }),
                })}
              </Fact>

              <Fact icon={UserCog} label={t("detail.fields.updated")}>
                {t("detail.byWhoWhen", {
                  name: data.updatedBy.name,
                  when: formatDate(data.updatedBy.at, uiLocale, {
                    dateStyle: "medium",
                    timeZone,
                  }),
                })}
              </Fact>

              <Fact icon={Mail} label={t("detail.fields.contacts")}>
                <CopyAllEmailsButton emails={data.allContactEmails} />
              </Fact>
            </FactGrid>

            {/* The product-wide Join. A room belongs to a group, so this is the
                one place on this page an admin can walk into the session without
                first choosing whose seat to look at — and it is absent entirely
                on an in-person product, where a locked button would be a promise
                that will never be kept. */}
            {voiceAvailable && data.groups.groups.length > 0 && (
              <div className="border-t border-border pt-4">
                <JoinVoiceButton
                  voiceIsOpen={voice.voiceIsOpen}
                  voiceHref={ROUTES.voice.groupSession(data.groups.groups[0].id)}
                  opensDate={voice.opensDate}
                  opensTime={voice.opensTime}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </Section>

      {/* ── As sold ────────────────────────────────────────────────────── */}
      <Section id="as-sold" title={t("detail.sections.as-sold")}>
        <p className="text-sm text-muted-foreground">
          {t("detail.asSoldCaption")}
        </p>
        {tr?.short_description && (
          <p className="text-sm">{tr.short_description}</p>
        )}
        <ProductOverviewCard product={product} />
        {/* The authored blurb, rendered by the same component the shop renders
            it with and in the same `marketing` variant — the variant belongs to
            the field, not to who is looking at it, so an admin reads the links
            live exactly as a parent does. */}
        <LongDescription markdown={tr?.long_description ?? ""} />
      </Section>

      {/* ── How it runs ────────────────────────────────────────────────── */}
      <Section id="how-it-runs" title={t("detail.sections.how-it-runs")}>
        <AdminProductHowItRuns
          product={product}
          site={data.site}
          municipalityName={data.municipalityName}
          siteNotesEditing={siteNotesEditing}
          onSiteNotesEditingChange={onSiteNotesEditingChange}
          onSaveSiteNotes={onSaveSiteNotes}
        />
      </Section>

      {/* ── Money ──────────────────────────────────────────────────────── */}
      <Section id="money" title={t("detail.sections.money")}>
        <AdminProductMoney product={product} />
      </Section>

      {/* ── People ─────────────────────────────────────────────────────── */}
      <Section id="people" title={t("detail.sections.people")}>
        <AdminProductPeople
          snapshot={data.groups}
          pending={pending}
          productType={product.product_type}
          billingMode={product.billing_mode}
          topic={product.topic}
          seatCount={product.seat_count}
          waitlistEnabled={product.waitlist_enabled}
          voiceAvailable={voiceAvailable}
          voiceIsOpen={voice.voiceIsOpen}
          opensDate={voice.opensDate}
          opensTime={voice.opensTime}
          robloxRenders={robloxRenders}
          deriveAvatars={deriveAvatars}
          chipDetails={chipDetails}
          actions={groupActions}
          groupDetails={data.groupDetails}
          editingGroupNotesId={editingGroupNotesId}
          onEditingGroupNotesChange={onEditingGroupNotesChange}
          onSaveGroupNotes={onSaveGroupNotes}
        />
      </Section>

      {/* ── Sessions ───────────────────────────────────────────────────── */}
      <Section id="sessions" title={t("detail.sections.sessions")}>
        <AdminProductSessions
          groups={data.groupDetails}
          now={feedNow}
          sourceTimeZone={product.timezone}
          editingEntryId={editingEntryId}
          onEditEntry={onEditEntry}
          onSaveEntry={onSaveEntry}
          onSendReport={onSendReport}
        />
      </Section>
    </div>
  );
}

/**
 * One anchored section.
 *
 * `scroll-mt-32` is what makes the pill's own jump land clear of the fixed
 * header and the pill itself — 4rem of header plus a gap plus the bar. It lives
 * on the section rather than in the scroll helper because it is a fact about
 * where the section may come to rest, and the helper is shared with pages whose
 * chrome is a different height.
 */
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-32 space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * The public URL, and a button that puts it on the clipboard.
 *
 * Absolute and shown in full rather than as a "Copy link" button alone, because
 * the two things an admin does with it are paste it and *check* it — a
 * municipality club's path carries the school slug, and getting that wrong is a
 * link that 404s for a whole town.
 */
function PublicLink({ url }: { url: string }) {
  const t = useTranslations("admin.products");
  const { copied, copy } = useCopyToClipboard();

  return (
    <span className="flex items-start gap-2">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 break-all text-primary underline-offset-2 hover:underline"
      >
        {url}
      </a>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-6 w-6 shrink-0", copied && "text-success")}
        onClick={() => void copy(url)}
        aria-label={t("detail.copyLink")}
        title={t("detail.copyLink")}
      >
        {copied ? (
          <Check aria-hidden className="h-3.5 w-3.5" />
        ) : (
          <Copy aria-hidden className="h-3.5 w-3.5" />
        )}
      </Button>
    </span>
  );
}
