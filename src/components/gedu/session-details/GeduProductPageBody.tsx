"use client";

import { useMemo, type ReactNode } from "react";
import { Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { MaterialLink } from "@/components/ui/material-link";
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
import type { MinecraftCheckStatus } from "@/components/minecraft/minecraft-username-row";
import type { GeduAssignedProduct, GeduAssignedProductGroup } from "@/types";
import {
  CopyAllEmailsButton,
  deduplicateEmails,
  geduChipPeople,
} from "./roster-helpers";
import { SessionDetailsBackLink } from "./BackLink";
import { GamerRosterRow } from "./GamerRosterRow";
import { GroupNotesPanel, type GroupNotesDraft } from "./GroupNotesPanel";
import { SiteNotesPanel, type SiteNotesDraft } from "./SiteNotesPanel";

/**
 * The gedu's product page: the assigned group's *workspace*, with the session
 * feed as its spine. It is the body of `/gedu/clubs|camps|events/[id]`, and the
 * same body a full-page preview scene renders over fixtures. It deliberately
 * takes everything as props — no query, no clock of its own beyond the shared
 * providers — which is what lets one body serve both shells.
 *
 * The shape, and why:
 *
 * - **The title is the product; the group is the line under it.** A gedu holds
 *   at most one group per product, so the two identify the same thing to them —
 *   and only one of the two is worth reading. Products are named by a human
 *   ("Minecraft Monday Club"); groups default to "Group A". Titling the page
 *   with the group meant every workspace a gedu opened was called a letter of
 *   the alphabet, and they had to read the eyebrow to find out which club they
 *   were in. The group's name and size still matter — they are the secondary
 *   identity line — and the type label stays the eyebrow above both.
 * - There is still no "your group" card and no badge announcing which group is
 *   theirs: the gedu arrived by clicking it, and the page *is* it.
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
 * - **Every Join is on a group surface, and only on a group surface.** This
 *   group's own Join is on its rail card; each peer group's is on its rail row.
 *   None is on a session card — not even the next one. A room belongs to a
 *   *group*, not to an occurrence, and putting one Join on the timeline and
 *   another in the rail made the same room read as two different rooms. It also
 *   meant the affordance moved down the page as the term went on. The rail is
 *   where every room on this product now lives, in one column, in one order.
 * - **An in-person product renders no Join at all** — not a locked one. A
 *   locked button is a promise that it will unlock; a camp in a library never
 *   will, because there is no room behind it. The whole affordance is absent.
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

interface GeduProductPageBodyProps {
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
   * the only reason no visibility check happens here.
   */
  materialUrl: string | null;
  /** The group's standing public note, independent of any session. */
  groupPublicNote: string | null;
  /** The group's standing staff-only note. */
  groupStaffNote: string | null;
  groupNotesEditing: boolean;
  onGroupNotesEditingChange: (editing: boolean) => void;
  /** Persist the group's notes. Awaited by the panel — see its own note. */
  onSaveGroupNotes: (draft: GroupNotesDraft) => void | Promise<void>;
  /**
   * The venue an in-person product runs at, or `null` for a remote one.
   *
   * **The question is `is_remote`, never "does it have a location".** A remote
   * municipality club carries a `location_id` by CHECK — the town it is run
   * for — so a caller testing for a location would put a door code and a
   * caretaker's name on a club that meets in a voice room. The workspace's data
   * source resolves the site itself and hands over `null` for anything remote,
   * so this prop being null is exactly "no building involved", never "we didn't
   * load it".
   */
  site: ProductSite | null;
  siteNotesEditing: boolean;
  onSiteNotesEditingChange: (editing: boolean) => void;
  /** Persist the venue's shared notes. Awaited by the panel. */
  onSaveSiteNotes: (draft: SiteNotesDraft) => void | Promise<void>;
  editingEntryId: string | null;
  onEditEntry: (entryId: string | null) => void;
  /**
   * Persist one session's edit. **Awaited by the feed**, which holds the editor
   * open and disabled until it settles and closes it only on success.
   */
  onSaveEntry: (
    entryId: string,
    draft: SessionEntryDraft,
  ) => void | Promise<void>;
  /**
   * Save a roster member's Minecraft username. A gedu is the person who finds
   * out a name is wrong — mid-session, when the server doesn't recognise it —
   * so the roster is where it gets fixed. Awaited by the roster row: the write
   * makes a Mojang lookup on the way through, so the row stays disabled for a
   * real round trip.
   */
  onSaveMinecraftUsername: (
    gamerId: string,
    username: string,
  ) => void | Promise<void>;
  /**
   * In-flight or just-landed Mojang checks, keyed by gamer id. A roster member
   * with no entry here shows the resting state derived from their account.
   *
   * It lives with whoever owns the save, because that is the only place that
   * knows a check started.
   */
  minecraftStatuses?: Readonly<Record<string, MinecraftCheckStatus>>;
}

export function GeduProductPageBody({
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
  onSaveMinecraftUsername,
  minecraftStatuses,
}: GeduProductPageBodyProps) {
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

  /**
   * Where leaving a voice room lands — this workspace, always.
   *
   * Named rather than left to the Join button's "wherever you clicked from"
   * default, and named as a route rather than read off the current pathname, so
   * every Join on this product agrees: the peer rows send you here too, which
   * is the point of covering somebody's room for ten minutes rather than
   * inheriting their page.
   */
  const workspaceHref = ROUTES.gedu.assignedProduct(
    data.product.product_type,
    data.product.id,
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

      {/* The masthead is a two-column row on desktop: identity on the left,
          the one outward action on the right. The Padlet used to sit up here
          beside it — it is gone from this page for good. Session reports are
          what families now read, so a link out to a third-party wall was a
          second, staler answer to the same question, and leaving it would have
          taught gedus to keep posting there. */}
      <header className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-border pb-5">
        <div className="min-w-0">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t(`typeLabel.${data.product.product_type}`)}
          </span>

          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            {productName}
          </h1>

          {assignedGroup && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {assignedGroup.name || t("untitledGroup")}
              </span>
              {/* Punctuation between two translated strings, so it is a
                  pseudo-element rather than a text node — it does not belong in
                  the message files. */}
              <span className="inline-flex items-center gap-1 before:mr-1 before:text-muted-foreground/50 before:content-['·']">
                <Users className="h-4 w-4" aria-hidden />
                {t("gamerCount", { count: assignedGroup.gamer_count })}
              </span>
            </p>
          )}
        </div>

        {/* Button-weight, not a chip. Fetching the materials is the first thing
            a gedu does when they open this page before a session, and a small
            tinted link tucked next to the type label read as metadata about the
            product rather than as the errand they came to run. */}
        {materialUrl && <MaterialLink href={materialUrl} variant="button" />}
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
            // No reading-width cap of its own. The column it sits in is already
            // two thirds of a capped page, and capping again left a band of
            // dead space down the middle of the workspace between the feed and
            // the rail — which read as a rendering fault, not as typography.
            <SessionFeed
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
          {assignedGroup && (
            <GroupRailCard
              group={assignedGroup}
              isRemote={data.product.is_remote}
              voiceIsOpen={voiceState.voiceIsOpen}
              opensDate={voiceState.opensDate}
              opensTime={voiceState.opensTime}
              backHref={workspaceHref}
              onSaveMinecraftUsername={onSaveMinecraftUsername}
              minecraftStatuses={minecraftStatuses}
            />
          )}

          <OtherGroupsRailCard
            peerGroups={peerGroups}
            isRemote={data.product.is_remote}
            voiceIsOpen={voiceState.voiceIsOpen}
            opensDate={voiceState.opensDate}
            opensTime={voiceState.opensTime}
            backHref={workspaceHref}
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
 *
 * The heading row takes an optional right-hand slot, and the group card uses it
 * for its gamer count. That is the same treatment the peer rows below give their
 * own counts, deliberately: a reader comparing "how big is my group" with "how
 * big is the group I might cover" should find both numbers in the same corner.
 */
function RailCard({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </h2>
          {trailing}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/** The gamer-count line the group card and every peer row share. */
function GamerCount({ count }: { count: number }) {
  const t = useTranslations("gedu.sessionDetails");
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
      <Users className="h-3 w-3" aria-hidden />
      {t("gamerCount", { count })}
    </span>
  );
}

/**
 * The peer-cover card: every other group running on this product, each one
 * name + how many children + who teaches it, and — on a remote product — a
 * live-state Join.
 *
 * This is the "can you watch my room for ten minutes?" surface. It sits *below*
 * this group's own card, because covering for somebody is the rarer errand: the
 * roster above it is what a gedu opens mid-session. Sister-group *rosters* stay
 * out: a gedu sees who is teaching alongside them, not the children in someone
 * else's group.
 *
 * **The row is three fixed lines, not a flow.** Line one is the group's name on
 * the left and its size hard right; line two is the gedu chips; line three is
 * Join, centred, on a line of its own. Name and size used to share that first
 * line *with* Join, and the chips could wrap up into it — so the layout was a
 * function of how many people happened to teach that group: one chip and Join
 * sat neatly beside the name, three chips and it wrapped underneath, four and it
 * landed in the middle of the chip run. Same card, three different shapes, none
 * of them chosen. Giving each of the three things a line it always occupies
 * makes every peer row the same row, whatever is in it — including a group with
 * no gedus at all, where the chips line just says so.
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
  backHref,
}: {
  peerGroups: readonly GeduAssignedProductGroup[];
  isRemote: boolean;
  voiceIsOpen: boolean;
  opensDate: string;
  opensTime: string;
  /** Where leaving a peer's room lands — this workspace, not theirs. */
  backHref: string;
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
              className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">
                  {group.name || t("untitledGroup")}
                </p>
                <GamerCount count={group.gamer_count} />
              </div>
              {/* The chips are labelled, because the line above them already
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
              {isRemote && (
                <div className="flex justify-center pt-0.5">
                  <JoinVoiceButton
                    voiceIsOpen={voiceIsOpen}
                    voiceHref={ROUTES.voice.groupSession(group.id)}
                    opensDate={opensDate}
                    opensTime={opensTime}
                    backHref={backHref}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </RailCard>
  );
}

/**
 * This group: its own room's Join, the gedus teaching it, then every child with
 * their parent's email and the copy-all helper.
 *
 * **It is titled "My Group", and it carries its size top-right.** "Group" was
 * ambiguous on a page whose other rail card is called "Other groups" — the
 * possessive is what makes the pair read as one distinction rather than as two
 * unrelated headings. The count sits in the same corner every peer row puts its
 * own, so "mine has eight, that one has six" is one horizontal glance rather
 * than a hunt.
 *
 * **The Join lives here, at the top of the card, and nowhere else on the page.**
 * A voice room belongs to a group, and this card is the group — so the button
 * sits above everything else in it, on a line of its own with the copy-all
 * helper beside it, where it is in the same place on every product a gedu opens
 * instead of migrating down the timeline as the term fills up. On an in-person
 * product it is simply absent: there is no room, so there is nothing to lock.
 *
 * **That action row is centred**, as is the copy-all row beneath it. Left-
 * aligned, one or two buttons sat against the card's left edge with a third of
 * the card empty beside them, which read as a layout that had run out rather
 * than as a decision; centring makes the actions a band across the top of the
 * card and matches the centred Join on every peer row below.
 *
 * **The roster renders open, with no disclosure.** It was collapsed in the
 * single-column draft for one reason — eight rows of children between the
 * masthead and the feed pushed the newest session most of a screen down. Out
 * here that reason is gone: nothing the gedu reads sits below the rail on
 * desktop, and on mobile the rail is already past the whole timeline, so the
 * roster's height costs a scroll rather than a displacement. A reference column
 * that hides its reference data behind a click isn't one.
 */
function GroupRailCard({
  group,
  isRemote,
  voiceIsOpen,
  opensDate,
  opensTime,
  backHref,
  onSaveMinecraftUsername,
  minecraftStatuses,
}: {
  group: GeduAssignedProductGroup;
  isRemote: boolean;
  voiceIsOpen: boolean;
  opensDate: string;
  opensTime: string;
  /** Where leaving this group's room lands — back on this workspace. */
  backHref: string;
  onSaveMinecraftUsername: (
    gamerId: string,
    username: string,
  ) => void | Promise<void>;
  minecraftStatuses?: Readonly<Record<string, MinecraftCheckStatus>>;
}) {
  const t = useTranslations("gedu.sessionDetails");
  const roster = useMemo(() => group.roster ?? [], [group.roster]);
  const emails = useMemo(
    () => deduplicateEmails(roster.map((r) => r.parent_email)),
    [roster],
  );

  return (
    <RailCard
      title={t("railGroupHeading")}
      trailing={<GamerCount count={group.gamer_count} />}
    >
      {isRemote && (
        <div className="flex justify-center">
          <JoinVoiceButton
            voiceIsOpen={voiceIsOpen}
            voiceHref={ROUTES.voice.groupSession(group.id)}
            opensDate={opensDate}
            opensTime={opensTime}
            backHref={backHref}
          />
        </div>
      )}
      {emails.length > 0 && (
        <div className="flex justify-center">
          <CopyAllEmailsButton emails={emails} />
        </div>
      )}

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
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("gamersLabel")}
        </p>
        {roster.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyRoster")}</p>
        ) : (
          <ul className="space-y-1.5">
            {roster.map((g) => (
              <GamerRosterRow
                key={g.gamer_id}
                gamer={g}
                onSaveMinecraftUsername={onSaveMinecraftUsername}
                minecraftStatus={minecraftStatuses?.[g.gamer_id]}
              />
            ))}
          </ul>
        )}
      </div>
    </RailCard>
  );
}
