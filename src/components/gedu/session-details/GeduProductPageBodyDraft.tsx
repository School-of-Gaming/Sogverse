"use client";

import { useMemo, type ReactNode } from "react";
import { Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { MaterialLink } from "@/components/ui/material-link";
import { PadletLink } from "@/components/ui/padlet-link";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";
import {
  SessionFeed,
  type SessionEntryDraft,
  type SessionFeedEntry,
  type SessionFeedGamer,
} from "@/components/gedu/session-feed";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { cn } from "@/lib/utils";
import { computeVoiceState } from "@/lib/voice-window";
import { useNow, useTimezone } from "@/providers";
import type { GeduAssignedProduct, GeduAssignedProductGroup } from "@/types";
import { CopyAllEmailsButton, deduplicateEmails } from "./AssignedGroupCard";
import { SessionDetailsBackLink } from "./BackLink";
import { GamerRosterRow } from "./GamerRosterRow";
import { GroupNotesPanel, type GroupNotesDraft } from "./GroupNotesPanel";

/**
 * **Draft** redesign of the gedu's product page: the assigned group's
 * *workspace*, with the session feed as its spine. Rendered today only by a
 * full-page preview scene; at promotion it becomes the body of
 * `/gedu/clubs|camps|events/[id]` and the live shell swaps fixtures for the
 * product query. It deliberately takes everything as props — no query, no clock
 * of its own beyond the shared providers — which is what lets one body serve
 * both shells.
 *
 * The shape, and why:
 *
 * - **The page is the group, not the product.** The gedu arrived by clicking
 *   their own group, so there is no "your group" card and no badge announcing
 *   which one is theirs — the group's name is the page's title. The product is
 *   context above it: type, name, and its two outward links (the family-facing
 *   Padlet and the staff-only material link) on one line.
 * - **Desktop is two columns**, because a gedu surface is a desktop surface.
 *   The main column is the timeline capped at a reading width; the third of the
 *   width beside it is a reference rail. Below `lg` it all stacks in DOM order —
 *   masthead, timeline, rail — so the phone keeps the weekly loop (read last
 *   week, join, write up) first and the reference material after it.
 * - **The group's standing notes are a full-width row under the masthead**, not
 *   a rail card. They answer "what is always true about this group" — how the
 *   shared world works, who the siblings are — which is what somebody needs
 *   *before* they start reading sessions, and they are prose: squeezed into a
 *   third of the page they wrapped into a narrow column nobody read. Above the
 *   split they get the reading width the feed has, and the columns start
 *   underneath them.
 * - **The rail holds the two things that are true between sessions**, this
 *   group first: its co-teachers and roster (the reference a gedu actually
 *   reaches for mid-session), then the other groups on the product — the
 *   peer-cover surface, where a colleague asking you to watch their room for
 *   ten minutes is one glance and one click. The *shape* is fixed — a product
 *   with no sister groups still renders the other-groups card, saying so — so
 *   the rail doesn't reshuffle between two products the same gedu teaches.
 * - **Each room has exactly one Join on the page.** This group's is on the
 *   prominent next-session entry in the timeline, where the gedu is already
 *   looking at the time it starts; every peer group's is on its own rail row.
 *   The old layout offered this group's room twice, which made the second one
 *   read as a different room.
 * - **No aggregate attention count above the timeline.** The per-entry alerts
 *   already are the queue, and each one sits on the card that has to be filled
 *   in; a chip naming a number the reader then has to go hunting for was one
 *   more thing to read on the way to the same place. The dashboard badge stays
 *   the cross-product signal.
 */
interface GeduProductPageBodyDraftProps {
  data: GeduAssignedProduct;
  /**
   * Newest first: the future sessions inside the horizon (furthest away first,
   * so the next session is the last of them), then the term running backwards.
   */
  entries: readonly SessionFeedEntry[];
  /** Attendance roster for the feed — same children as the group roster. */
  feedRoster: readonly SessionFeedGamer[];
  /** Zone the schedule was authored in; the feed renders in the viewer's. */
  sourceTimeZone: string;
  /**
   * Staff-only lesson/material URL, or `null` when unset. **Never render this on
   * a surface a parent or gamer can reach** — this page is gedu-only, which is
   * the only reason no visibility check happens here. At promotion it comes from
   * the product's material column, alongside the family-facing Padlet.
   */
  materialUrl: string | null;
  /** The group's standing public note, independent of any session. */
  groupPublicNote: string | null;
  /** The group's standing staff-only note. */
  groupStaffNote: string | null;
  groupNotesEditing: boolean;
  onGroupNotesEditingChange: (editing: boolean) => void;
  onSaveGroupNotes: (draft: GroupNotesDraft) => void;
  editingEntryId: string | null;
  onEditEntry: (entryId: string | null) => void;
  onSaveEntry: (entryId: string, draft: SessionEntryDraft) => void;
}

export function GeduProductPageBodyDraft({
  data,
  entries,
  feedRoster,
  sourceTimeZone,
  materialUrl,
  groupPublicNote,
  groupStaffNote,
  groupNotesEditing,
  onGroupNotesEditingChange,
  onSaveGroupNotes,
  editingEntryId,
  onEditEntry,
  onSaveEntry,
}: GeduProductPageBodyDraftProps) {
  const t = useTranslations("gedu.sessionDetails");
  const locale = useLocale();
  const uiLocale = resolveLocale(locale);
  const timeZone = useTimezone();
  const now = useNow();

  const productName =
    resolveTranslation(data.product.translations, uiLocale)?.name ?? "";

  const { assignedGroup, peerGroups } = useMemo(() => {
    const assigned = data.groups.find((g) => g.id === data.my_group_id) ?? null;
    const peers = data.groups.filter((g) => g.id !== data.my_group_id);
    return { assignedGroup: assigned, peerGroups: peers };
  }, [data.groups, data.my_group_id]);

  const voiceState = useMemo(
    () => computeVoiceState({ product: data.product, now, locale, timeZone }),
    [data.product, now, locale, timeZone],
  );

  return (
    // Wide, because this is a gedu surface and gedus are at a desk. The reading
    // column inside is still capped; the extra width buys the reference rail.
    <div className="container mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <SessionDetailsBackLink />

      <header className="mt-5 border-b border-border pb-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t(`typeLabel.${data.product.product_type}`)}
          </span>
          {assignedGroup && (
            <span className="text-sm text-muted-foreground">{productName}</span>
          )}
          {/* Product scope, inline in the masthead rather than floated to the
              right of the title: the Padlet and the material link belong to the
              product, not to this group, and the group's name is the title. */}
          {data.product.padlet_url && (
            <PadletLink href={data.product.padlet_url} />
          )}
          {materialUrl && <MaterialLink href={materialUrl} />}
        </div>

        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {assignedGroup
              ? assignedGroup.name || t("untitledGroup")
              : productName}
          </h1>
          {assignedGroup && (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-4 w-4" aria-hidden />
              {t("gamerCount", { count: assignedGroup.gamer_count })}
            </span>
          )}
        </div>
      </header>

      {assignedGroup && (
        // Full width, but the panel inside is capped at the same reading width
        // the timeline uses — which is also the main column's width, so the
        // heading and its Edit control line up with the feed beneath them.
        <Card className="mt-6">
          <CardContent className="p-4 sm:p-5">
            <div className="max-w-3xl">
              <GroupNotesPanel
                publicNote={groupPublicNote}
                staffNote={groupStaffNote}
                editing={groupNotesEditing}
                onEditingChange={onGroupNotesEditingChange}
                onSave={onSaveGroupNotes}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {assignedGroup ? (
            <SessionFeed
              className="max-w-3xl"
              entries={entries}
              roster={feedRoster}
              sourceTimeZone={sourceTimeZone}
              editingEntryId={editingEntryId}
              onEditEntry={onEditEntry}
              onSaveEntry={onSaveEntry}
            />
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                {t("noAssignedGroup")}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Static, not sticky. An eight-child roster plus the peer rows is
            taller than a viewport, so pinning the column would need an inner
            scroll pane beside the document scroll — a second scrollbar, and a
            column that stops agreeing with the page it sits next to. */}
        <aside className="min-w-0 space-y-4">
          {/* This group before the peers: the roster and its parent emails are
              what a gedu reaches for during their own session, and the peer
              rows only matter when somebody asks for cover. */}
          {assignedGroup && <GroupRailCard group={assignedGroup} />}

          <OtherGroupsRailCard
            peerGroups={peerGroups}
            isRemote={data.product.is_remote}
            voiceIsOpen={voiceState.voiceIsOpen}
            opensDate={voiceState.opensDate}
            opensTime={voiceState.opensTime}
          />
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reference rail                                                     */
/* ------------------------------------------------------------------ */

/**
 * One card in the rail. Tighter padding than a page card — the rail is a third
 * of the width, so every card that spends a page card's padding pushes the one
 * below it further down the first screen.
 */
function RailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * The peer-cover card: every other group running on this product, each one
 * name + who teaches it + how many children + a live-state Join.
 *
 * This is the "can you watch my room for ten minutes?" surface, and the row is
 * deliberately one line of identity plus the button — enough to know you have
 * the right room, and nothing that needs reading before you click. It sits
 * *below* this group's own card, because covering for somebody is the rarer
 * errand: the roster above it is what a gedu opens mid-session. Sister-group
 * *rosters* stay out: a gedu sees who is teaching alongside them, not the
 * children in someone else's group.
 *
 * A product with only one group still renders the card, saying so. The rail's
 * shape is then the same on every product a gedu opens, which is worth more than
 * the four lines saved by hiding it.
 */
function OtherGroupsRailCard({
  peerGroups,
  isRemote,
  voiceIsOpen,
  opensDate,
  opensTime,
}: {
  peerGroups: readonly GeduAssignedProductGroup[];
  isRemote: boolean;
  voiceIsOpen: boolean;
  opensDate: string;
  opensTime: string;
}) {
  const t = useTranslations("gedu.sessionDetails");

  return (
    <RailCard title={t("railOtherGroupsHeading")}>
      {peerGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noOtherGroups")}</p>
      ) : (
        <ul className="space-y-2">
          {peerGroups.map((group) => (
            <li
              key={group.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-2.5"
            >
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className="truncate text-sm font-medium leading-tight">
                    {group.name || t("untitledGroup")}
                  </p>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                    <Users className="h-3 w-3" aria-hidden />
                    {t("gamerCount", { count: group.gamer_count })}
                  </span>
                </div>
                {group.gedus.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    {t("noGedus")}
                  </p>
                ) : (
                  <GeduChips gedus={group.gedus} compact />
                )}
              </div>
              <JoinVoiceButton
                voiceIsOpen={voiceIsOpen}
                voiceHref={isRemote ? ROUTES.voice.groupSession(group.id) : "#"}
                opensDate={opensDate}
                opensTime={opensTime}
              />
            </li>
          ))}
        </ul>
      )}
    </RailCard>
  );
}

/**
 * Who is in this group: the gedus teaching it, then every child with their
 * parent's email and the copy-all helper.
 *
 * **The roster renders open, with no disclosure.** It was collapsed in the
 * single-column draft for one reason — eight rows of children between the
 * masthead and the feed pushed the newest session most of a screen down. Out
 * here that reason is gone: nothing the gedu reads sits below the rail on
 * desktop, and on mobile the rail is already past the whole timeline, so the
 * roster's height costs a scroll rather than a displacement. A reference column
 * that hides its reference data behind a click isn't one.
 *
 * The two-column "Gamer / Parent email" header the wide card used is dropped —
 * at a third of the page the rows stack, and the header would label columns
 * that aren't there.
 */
function GroupRailCard({ group }: { group: GeduAssignedProductGroup }) {
  const t = useTranslations("gedu.sessionDetails");
  const roster = useMemo(() => group.roster ?? [], [group.roster]);
  const emails = useMemo(
    () => deduplicateEmails(roster.map((r) => r.parent_email)),
    [roster],
  );

  return (
    <RailCard title={t("railGroupHeading")}>
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("gedusLabel")}
        </p>
        {group.gedus.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noGedus")}</p>
        ) : (
          <GeduChips gedus={group.gedus} />
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("gamersLabel")}
          </p>
          {emails.length > 0 && <CopyAllEmailsButton emails={emails} />}
        </div>
        {roster.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyRoster")}</p>
        ) : (
          <ul className="space-y-1.5">
            {roster.map((g) => (
              <GamerRosterRow key={g.gamer_id} gamer={g} />
            ))}
          </ul>
        )}
      </div>
    </RailCard>
  );
}

/**
 * Identicon-and-first-name chips for a set of gedus. `compact` is the peer-row
 * size — the rail rows carry a Join button on the same line, so the chips there
 * have to stay smaller than the group card's.
 */
function GeduChips({
  gedus,
  compact = false,
}: {
  gedus: GeduAssignedProductGroup["gedus"];
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {gedus.map((g) => (
        <span
          key={g.id}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted",
            compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
          )}
        >
          <Avatar className={compact ? "h-4 w-4" : "h-5 w-5"}>
            <Identicon id={g.id} size={compact ? 16 : 20} />
          </Avatar>
          <span className="leading-none">{g.first_name}</span>
        </span>
      ))}
    </div>
  );
}
