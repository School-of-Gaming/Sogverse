"use client";

import { useMemo, type ReactNode } from "react";
import { Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { MaterialLink } from "@/components/ui/material-link";
import { PadletLink } from "@/components/ui/padlet-link";
import { PersonChipList } from "@/components/ui/person-chip";
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
import {
  CopyAllEmailsButton,
  deduplicateEmails,
  geduChipPeople,
} from "./AssignedGroupCard";
import { SessionDetailsBackLink } from "./BackLink";
import { GamerRosterRow } from "./GamerRosterRow";
import { GroupNotesPanel, type GroupNotesDraft } from "./GroupNotesPanel";
import { SiteNotesPanel, type SiteNotesDraft } from "./SiteNotesPanel";

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
 * - **The standing notes are a full-width row under the masthead**, not a rail
 *   card. They answer "what is always true here" — how the shared world works,
 *   who the siblings are, which door the group comes in through — which is what
 *   somebody needs *before* they start reading sessions. They span the whole
 *   container rather than being capped at the timeline's reading width: capped,
 *   they sat in the left third of a wide workspace with the rest of the row
 *   blank, which read as a rendering fault rather than as a choice.
 * - **An in-person product also carries its site's notes**, beside the group's
 *   own on the same row and inside the same card — a bordered column, not a
 *   second card, because a card inside a card says "different kind of thing"
 *   when these are two instances of one kind. Site notes belong to the *venue*
 *   and every product running there reads the same two paragraphs, so the panel
 *   names the site and says so; a remote product has no building and the row
 *   collapses back to one column.
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
/**
 * The venue an in-person product runs at, with the two notes that hang off it.
 *
 * Both notes are **site-scoped**: they are shared by every product running
 * there, which is why the panel that renders them says so by name.
 */
export interface ProductSite {
  name: string;
  /** Street address, family-facing. `null` when the venue record has none. */
  address: string | null;
  /** The site note families can eventually read. */
  publicNote: string | null;
  /** The site note only Gedus and admins ever see. */
  staffNote: string | null;
}

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
  /**
   * The venue an in-person product runs at, or `null` for a remote one. Every
   * in-person product has a site (the schema requires it), and nothing on a
   * remote product does — so this prop being null is exactly "no building
   * involved", not "we didn't load it".
   *
   * At promotion it comes from the product's location joined to its
   * family-facing details (address + note) and its staff-only note.
   */
  site: ProductSite | null;
  siteNotesEditing: boolean;
  onSiteNotesEditingChange: (editing: boolean) => void;
  onSaveSiteNotes: (draft: SiteNotesDraft) => void;
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
  site,
  siteNotesEditing,
  onSiteNotesEditingChange,
  onSaveSiteNotes,
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
    //
    // No horizontal padding of its own: the dashboard layout this body renders
    // inside already spends a gutter on every side, and adding a second one
    // here double-pads the phone (where the two gutters are most of the screen)
    // while doing nothing at all on the desktop this page is designed for.
    <div className="mx-auto max-w-7xl py-6 sm:py-10">
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
        // One card spanning the container, holding one panel per scope. The
        // site panel is a bordered column beside the group's rather than a card
        // of its own: nesting a card inside a card announces a change of kind,
        // and these are two instances of the same kind of thing — standing
        // notes, differing only in what they are standing on.
        <Card className="mt-6">
          <CardContent className="p-4 sm:p-5">
            <div
              className={cn(
                "grid gap-5",
                site !== null && "lg:grid-cols-2 lg:gap-8",
              )}
            >
              <GroupNotesPanel
                publicNote={groupPublicNote}
                staffNote={groupStaffNote}
                editing={groupNotesEditing}
                onEditingChange={onGroupNotesEditingChange}
                onSave={onSaveGroupNotes}
              />
              {site !== null && (
                <div className="border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                  <SiteNotesPanel
                    siteName={site.name}
                    address={site.address}
                    publicNote={site.publicNote}
                    staffNote={site.staffNote}
                    editing={siteNotesEditing}
                    onEditingChange={onSiteNotesEditingChange}
                    onSave={onSaveSiteNotes}
                  />
                </div>
              )}
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
                {/* The chips are labelled, because the row above them already
                    carries a *gamer* count — an unlabelled row of faces next to
                    "6 gamers" reads as six children, and the whole point of
                    this card is knowing whose room you would be covering. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t("gedusLabel")}
                  </span>
                  {group.gedus.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground">
                      {t("noGedus")}
                    </span>
                  ) : (
                    <PersonChipList
                      people={geduChipPeople(group.gedus)}
                      size="compact"
                    />
                  )}
                </div>
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
          <PersonChipList people={geduChipPeople(group.gedus)} />
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
