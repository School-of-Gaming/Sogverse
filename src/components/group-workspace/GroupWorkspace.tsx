"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { MaterialLink } from "@/components/ui/material-link";
import { PersonChipList } from "@/components/ui/person-chip";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";
import { GamerFlairDialog } from "@/components/member-flair";
import {
  SessionFeed,
  entryOwesCreations,
  type CreationsObligation,
  type SessionEntryDraft,
  type SessionFeedEntry,
  type SessionFeedGamer,
  type SessionReportSendResult,
} from "@/components/gedu/session-feed";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { finalSessionDate, sessionEntryId } from "@/lib/session-occurrence";
import { cn } from "@/lib/utils";
import { computeVoiceState } from "@/lib/voice-window";
import { useNow, useTimezone } from "@/providers";
import type {
  GameAccountStatus,
  GamePlatform,
} from "@/components/game-account";
import type { RobloxRenderMap } from "@/services/roblox";
import { platformForTopic } from "@/lib/products/topics";
import type {
  GamerCreation,
  GeduAssignedProduct,
  GeduAssignedProductGroup,
} from "@/types";
import {
  CopyAllEmailsButton,
  deduplicateEmails,
  geduChipPeople,
} from "./roster-helpers";
import { SessionDetailsBackLink } from "./BackLink";
import { ParticipantRosterRow } from "./ParticipantRosterRow";
import { rosterContactEmail } from "./types";
import { GroupNotesPanel, type GroupNotesDraft } from "./GroupNotesPanel";
import { SitePanel, type SiteNotesDraft } from "./SitePanel";

/**
 * One group of one product, as the people running it work it: the group's
 * *workspace*, with the session feed as its spine. It is the body of the gedu's
 * `/gedu/clubs|camps|events/[id]`, the body of the admin's group details page,
 * and the same body a full-page preview scene renders over fixtures. It
 * deliberately takes everything as props — no query, no clock of its own beyond
 * the shared providers — which is what lets one body serve every shell.
 *
 * **The design below is written from the gedu's side**, because a gedu is who
 * this page is *for*. The admin surface exists to show an admin exactly what the
 * gedu teaching the group sees, so every rule here holds there unchanged — an
 * admin-shaped variation of any of it would be the drift the shared body exists
 * to prevent.
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
 *   width beside it is a reference rail.
 * - **On a phone the rail comes first**, before the standing notes and the feed:
 *   masthead → rail → notes → timeline. What a gedu wants from this page on a
 *   phone is the Join, and the Join lives on the group's rail card; a phone
 *   layout that put a term of sessions between them made the one urgent thing
 *   the last thing reachable. The timeline is a scroll either way, so it loses
 *   nothing by sitting under the two short blocks above it.
 * - **That order is the DOM's, not a CSS reordering**, so reading order, tab
 *   order and visual order agree on the surface where the mistake would be
 *   invisible. The desktop arrangement is bought by *placing* the three blocks
 *   explicitly in the grid instead — notes across the top, timeline in the wide
 *   column, rail beside it. **The trade is real and it is on the desktop side**:
 *   a keyboard user there reaches the rail's Join and roster before the notes
 *   and the feed, which is up and to the right of where they started. It is the
 *   better half to spend, because the rail holds this page's one action and its
 *   reference material — a defensible first stop — whereas a phone whose reading
 *   order disagreed with its single visible column would have no second column
 *   to make the disagreement legible.
 * - **The standing notes are a full-width row**, not a rail card. They answer
 *   "what is always true here" — how the shared world works, who the siblings
 *   are, which door the group comes in through — which is what somebody needs
 *   *before* they start reading sessions. They span the whole container rather
 *   than being capped at the timeline's reading width: capped, they sat in the
 *   left third of a wide workspace with the rest of the row blank, which read as
 *   a rendering fault rather than as a choice.
 * - **An in-person product also carries its site**, beside the group's own
 *   notes on the same row and inside the same card — a bordered column, not a
 *   second card, because a card inside a card says "different kind of thing"
 *   when these are two instances of one kind. A site's name, address and two
 *   notes belong to the *building* and every product running there reads the
 *   same four fields, so the panel names the site and says so; a remote product
 *   has no building and the row collapses back to one column. **What is
 *   writable here is the same on both shells**: the two notes, which describe
 *   the building. The name and the address are the site *record* and are edited
 *   on the site's own page, which an admin shell links to and a gedu shell does
 *   not have — the one difference, and it is a link rather than a capability.
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
 * The per-member overlay on the group's roster: who is new to the group, what
 * staff have written about them, what they have made, and how both are written
 * back.
 *
 * **One object rather than seven props, because it is one decision.** A caller
 * that made this page's staff-scoped read of the group's membership can answer
 * all of it at once — there is no surface holding newcomer stamps but no notes,
 * so seven props would be seven ways to spell one fact.
 *
 * Every record is keyed by `participant_id`, and **absence is the common case**:
 * most members are neither new, nor written about, nor carrying a creation, so a
 * missing key is the answer rather than a gap. The value types say `| undefined`
 * for exactly that reason — a lookup here misses far more often than it hits,
 * and the maps are the answer to "who is marked", never a guarantee about who is
 * in them.
 *
 * It is *mostly* staff-only. The creations are the exception, and the dialog
 * that edits them says so: staff write them and the member's own family reads
 * them on their product page.
 */
export interface RosterMemberFlair {
  /**
   * The instant the newcomer badge's meter is measured against. The caller's, so the
   * badge answers off the same clock as everything else on the page — a scene's
   * frozen instant, a live page's request-stable now.
   */
  now: Date;
  /** ISO join stamps. A member past the window keeps their key and simply stops rendering a badge. */
  newcomers: Readonly<Record<string, string | undefined>>;
  /** Note text. A member with no note has no key; `""` and absent mean the same thing. */
  notes: Readonly<Record<string, string | undefined>>;
  /** Who last wrote each note, where that is known. Read only for members who have one. */
  noteEditors: Readonly<Record<string, string | undefined>>;
  /**
   * What each member made during the run. A member with none has **no key** —
   * an empty list is left out on the way in, exactly as a null note is — so the
   * key set is "who has a creation", which is what the owed derivation reads.
   */
  creations: Readonly<Record<string, readonly GamerCreation[] | undefined>>;
  /**
   * Persist one member's note. **Awaited by the dialog**, which holds its Save
   * disabled until the write lands and closes only then; the trimmed text
   * arrives here, and an empty string means "clear it".
   */
  onSaveNote: (participantId: string, text: string) => void | Promise<void>;
  /**
   * Replace one member's creations. **Awaited by the dialog**, same contract as
   * the note's; an empty list deletes the row. Both writes are idempotent
   * replaces, which is what lets the dialog retry a half-landed save.
   */
  onSaveCreations: (
    participantId: string,
    creations: readonly GamerCreation[],
  ) => void | Promise<void>;
}

/**
 * The site an in-person product runs at: what it is called, where it is, and
 * the two notes that hang off it.
 *
 * All four are **site-scoped** — shared by every product running there, which
 * is why the panel that renders them says so by name.
 */
export interface ProductSite {
  name: string;
  /** Street address, family-facing. `null` when the site record has none. */
  address: string | null;
  /** The site note families can eventually read. */
  publicNote: string | null;
  /** The site note only Gedus and admins ever see. */
  staffNote: string | null;
}

interface GroupWorkspaceProps {
  data: GeduAssignedProduct;
  /**
   * Newest first: the future sessions inside the horizon (furthest away first,
   * so the next session is the last of them), then the term running backwards.
   */
  entries: readonly SessionFeedEntry[];
  /**
   * The instant `entries` were built from, handed to the feed so its liveness,
   * its editor selection and its labels all answer off the same clock the
   * entries did.
   *
   * **Deliberately not this component's own `useNow()`**, which is the live
   * ticking clock and stays that way: the masthead's voice window must keep
   * reading it, or a Join button would lie about whether a room is open. The
   * feed's clock is the caller's to decide because the caller is what freezes
   * it while a session editor is open — see the workspace's own note. Two
   * clocks on this page on purpose, and the split is which of them can be
   * stopped.
   */
  feedNow: Date;
  /** Attendance roster for the feed — same children as the group roster. */
  feedRoster: readonly SessionFeedGamer[];
  /** Zone the schedule was authored in; the feed renders in the viewer's. */
  sourceTimeZone: string;
  /**
   * Staff-only lesson/material URL, or `null` when unset. **Never render this on
   * a surface a parent or gamer can reach** — this workspace is staff-only
   * (gedu and admin), which is the only reason no visibility check happens
   * here.
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
   * The site an in-person product runs at, or `null` for a remote one.
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
  /** Persist the site's shared notes. Awaited by the panel. */
  onSaveSiteNotes: (draft: SiteNotesDraft) => void | Promise<void>;
  /**
   * Where this site's record is edited, for a shell whose viewer has such a
   * page. Absent — the gedu shell's answer, and a scene's — the site section
   * carries no way out, which is correct: a gedu has no admin site page.
   *
   * **The body's site section is otherwise identical on both shells, and that is
   * deliberate rather than incidental.** Both pass the notes save and neither
   * passes a details save, so both surfaces render the same four fields with the
   * same two editable — which is what "an admin sees what the gedu sees" has to
   * mean literally. The name and the address are the site *record*, and a page
   * scoped to one group is not where a record shared by every product in the
   * building gets renamed; this link is how an admin gets to the page that is.
   * Like the back link and the voice rooms' way back, it is a statement about
   * who brought you here — the one kind of thing a shared body cannot know.
   */
  siteEditHref?: string;
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
   * Email one session's report to the group's families. **Awaited by the
   * feed**, which disables the button before it runs and leaves it disabled
   * until the sent line takes its place; a rejection is what hands it back.
   */
  onSendReport: (entryId: string) => Promise<SessionReportSendResult>;
  /**
   * Attach one already-normalized JPEG to a session's report, resolving with
   * the stored id. **Called by the card's Save**, not by the picker: a photo is
   * held in the browser with the rest of the draft until the whole card
   * commits.
   */
  onAddPhoto: (
    entryId: string,
    photo: { file: Blob; width: number; height: number },
  ) => Promise<string>;
  /** Remove one photo by its stored id. Called by the same Save. */
  onRemovePhoto: (imageId: string) => Promise<void>;
  /**
   * Save a roster member's game username, on whichever platform this product's
   * topic is about. A gedu is the person who finds out a name is wrong —
   * mid-session, when the server doesn't recognise it — so the roster is where
   * it gets fixed. Awaited by the roster row: the write makes the platform's own
   * lookup on the way through, so the row stays disabled for a real round trip.
   *
   * Never called on a product whose topic names no platform, because no row on
   * such a roster renders an editor.
   */
  onSaveGameUsername: (
    gamerId: string,
    username: string,
  ) => void | Promise<void>;
  /**
   * In-flight or just-landed platform checks, keyed by gamer id. A roster member
   * with no entry here shows the resting state derived from their account.
   *
   * It lives with whoever owns the save, because that is the only place that
   * knows a check started.
   */
  gameStatuses?: Readonly<Record<string, GameAccountStatus>>;
  /**
   * The resolved Roblox renders for this roster, keyed by account id as a
   * string — what the by-id avatars batch answers with.
   *
   * **A prop rather than a lookup this body makes**, and that is the same "one
   * body, two shells" split every other datum here obeys: the live workspace
   * resolves the whole roster in one request and hands the answers down, and a
   * fixture-driven scene hands down nothing at all, so a preview never reaches a
   * third-party host on load. An id absent from the record is an answer that has
   * not arrived; the row draws the stand-in either way, because a Roblox figure
   * is decoration and its absence is not worth a loading state.
   *
   * Untouched by the Minecraft side, which derives its own figure from a
   * verified name and needs nothing handed in.
   */
  robloxAvatarUrls?: RobloxRenderMap;
  /**
   * The roster's staff-only overlay — newcomer stamps, note markers, and the
   * note write-back.
   *
   * **Required, because this whole body is staff-only and every shell that
   * renders it can answer it.** Both live shells build it from the same
   * staff-scoped read as the roster, so a workspace without it is not a page
   * anyone can reach — and an optional prop here would leave the roster able to
   * render a state the product does not have, with no way in to writing a note.
   *
   * It travels with the roster rather than after it: both records are handed in
   * whole at first paint, so a badge or a lit note button never lands on a row
   * the reader is already looking at.
   *
   * **"Nothing is marked" is spelled with empty maps, never with an absent
   * overlay.** A group where nobody is inside the newcomer window and nobody has
   * been written about hands over the same object with nothing in its records —
   * which is exactly what the clubs-only badge gate already produces on a camp
   * (see `derive-roster-flair.ts`, where a non-club product yields an empty
   * newcomers map and its notes untouched).
   */
  memberFlair: RosterMemberFlair;
  /**
   * The link out of this workspace, rendered at the top of the page. Omitted,
   * the body renders the gedu's own back link ("Back to My SOG"); `null` renders
   * none at all — the admin shell passes `null` because its frame already
   * carries a back link that has to hold its position across the skeleton and
   * the loaded state, and a second one inside the body would double it. The way
   * out of a workspace belongs to whoever brought you in.
   */
  backLink?: ReactNode;
  /**
   * The route THIS workspace lives at — where leaving a voice room joined from
   * here lands. Omitted, it is the gedu route for this product, which is right
   * for the gedu shell and wrong for any other: an admin leaving a room would
   * be bounced through /gedu to /admin instead of back to the group they were
   * looking at. Same ownership rule as {@link backLink}.
   */
  workspaceHref?: string;
  /**
   * What the rail's first card is called. Omitted, it is the gedu's "My Group",
   * which is the possessive that makes the pair with "Other groups" read as one
   * distinction — and which is a claim only the gedu teaching the group can
   * make. An admin holds no group, so their shell passes the category word
   * instead; the card carries the group's own *name* either way, so what this
   * chooses is only how the heading relates the card to its reader. Same
   * ownership rule as {@link backLink}: a string that is about who brought you
   * here belongs to whoever did.
   */
  groupHeading?: string;
}

export function GroupWorkspace({
  data,
  entries,
  feedNow,
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
  siteEditHref,
  editingEntryId,
  onEditEntry,
  onSaveEntry,
  onSendReport,
  onAddPhoto,
  onRemovePhoto,
  onSaveGameUsername,
  gameStatuses,
  robloxAvatarUrls,
  memberFlair,
  backLink,
  workspaceHref: workspaceHrefProp,
  groupHeading,
}: GroupWorkspaceProps) {
  const t = useTranslations("gedu.sessionDetails");
  const p = useTranslations("productType");
  const locale = useLocale();
  const uiLocale = resolveLocale(locale);
  const timeZone = useTimezone();
  const now = useNow();

  /**
   * Whose per-gamer dialog is open — an id, not the values themselves, so the
   * dialog always shows what the records currently hold rather than a copy taken
   * when it opened.
   *
   * **It lives on the page rather than on the rail card, because two places now
   * route into one dialog**: every roster row's button, and every chip in the
   * final session's creations block down in the feed. One open dialog is all
   * this page can ever have, so holding the id anywhere lower would mean a
   * second dialog with a second draft and a second parser for the one the
   * reader would then have two ways to open.
   */
  const [openFor, setOpenFor] = useState<string | null>(null);

  const productName =
    resolveTranslation(data.product.translations, uiLocale)?.name ?? "";

  /**
   * Which game identity this page's roster shows, or `null` for a product about
   * no single account.
   *
   * Derived here from the product the body was handed rather than taken as a
   * prop, so the topic on screen and the platform the rows render can't
   * disagree — the shell resolves the same question from the same field to pick
   * a mutation, and both answers come out of one function over one column.
   */
  const platform = platformForTopic(data.product.topic);

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
   * The member the open dialog is about, found in this group's roster — the
   * only roster on the page that carries one, and the only set of people either
   * of the two ways in can name.
   */
  const openMember = useMemo(
    () =>
      openFor === null
        ? null
        : (assignedGroup?.roster?.find(
            (member) => member.participant_id === openFor,
          ) ?? null),
    [assignedGroup, openFor],
  );

  /**
   * What this run's final session owes in creations, or `null` on every product
   * that does not require them — which is almost all of them.
   *
   * **Derived here rather than by either shell**, for the same reason the roster
   * flair maps are: the gedu's workspace and the admin's group page must reach
   * the same answer, and it is assembled from things this body already holds —
   * the product's flag and schedule, and the roster's creations map. A second
   * copy in each shell would be a second place for a Gedu and an admin to
   * disagree about whether the last session of a term is finished.
   *
   * The final session is the schedule's last occurrence on or before the end
   * date, which is exactly what the dashboard's SQL computes; an open-ended
   * product has none and therefore never owes.
   */
  const creationsObligation = useMemo<CreationsObligation | null>(() => {
    if (!data.product.requires_gamer_creations) return null;
    const date = finalSessionDate({
      slots: data.product.schedule_slots,
      startDate: data.product.start_date,
      endDate: data.product.end_date,
    });
    return {
      finalEntryId:
        date === null ? null : sessionEntryId(data.my_group_id, date),
      // The map's keys are already "who has at least one" — an empty list is
      // left out on the way in — and the length test states that rather than
      // trusting it silently.
      withCreations: new Set(
        Object.entries(memberFlair.creations)
          .filter(([, list]) => (list?.length ?? 0) > 0)
          .map(([participantId]) => participantId),
      ),
    };
  }, [data.product, data.my_group_id, memberFlair.creations]);

  /**
   * Whether the roster should be *itemizing* that obligation right now.
   *
   * The session card can say "this group's final session is not done"; only the
   * roster can say which members it is waiting on. Both answer off the same
   * derivation, so a row can never be marked while the card beside it reads
   * finished — and the gate is the entry's own `owed`, which is what keeps the
   * marker off a final session that has not happened yet, or one from before the
   * enforcement epoch.
   */
  const finalEntry = useMemo(
    () =>
      creationsObligation?.finalEntryId == null
        ? undefined
        : entries.find(
            (entry) => entry.id === creationsObligation.finalEntryId,
          ),
    [entries, creationsObligation],
  );
  const creationsOwedNow =
    finalEntry !== undefined &&
    finalEntry.kind === "past" &&
    finalEntry.owed &&
    entryOwesCreations(finalEntry, feedRoster, creationsObligation);

  /**
   * Where leaving a voice room lands — this workspace, always.
   *
   * Named rather than left to the Join button's "wherever you clicked from"
   * default, and named as a route rather than read off the current pathname, so
   * every Join on this product agrees: the peer rows send you here too, which
   * is the point of covering somebody's room for ten minutes rather than
   * inheriting their page.
   */
  const workspaceHref =
    workspaceHrefProp ??
    ROUTES.gedu.assignedProduct(data.product.product_type, data.product.id);

  return (
    // Wide, because this is a staff surface and staff are at a desk. The reading
    // column inside is still capped; the extra width buys the reference rail.
    //
    // No horizontal padding of its own: the dashboard layout this body renders
    // inside already spends a gutter on every side, and adding a second one
    // here double-pads the phone (where the two gutters are most of the screen)
    // while doing nothing at all on the desktop this page is designed for.
    <div className="mx-auto max-w-7xl py-6 sm:py-10">
      {/* `undefined` means "the gedu default", `null` means "the shell already
          has one" — so this is an explicit check, not `??`. */}
      {backLink === undefined ? <SessionDetailsBackLink /> : backLink}

      {/* The masthead is a two-column row on desktop: identity on the left,
          the one outward action on the right. A family-facing link out to a
          third-party wall used to sit up here beside it, and is gone for good:
          the session reports below are what families read now, so the link was
          a second, staler answer to the same question, and leaving it would
          have taught gedus to keep posting there. */}
      <header className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-border pb-5">
        <div className="min-w-0">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {p(data.product.product_type)}
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
                {t("participantCount", {
                  count: assignedGroup.participant_count,
                })}
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

      {/* One grid for everything below the masthead, so the phone gets the
          order the desk does not: rail, then standing notes, then the feed.
          DOM order **is** that order — nothing here is reordered by CSS — and
          the desktop arrangement is bought by placing three items explicitly
          instead: notes across the top, feed in the wide column, rail beside
          it. See the component note for the trade that buys. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3 lg:items-start lg:gap-8">
        {/* Static, not sticky. An eight-child roster plus the peer rows is
            taller than a viewport, so pinning the column would need an inner
            scroll pane beside the document scroll — a second scrollbar, and a
            column that stops agreeing with the page it sits next to. */}
        <aside className="min-w-0 space-y-4 lg:col-start-3 lg:row-start-2">
          {/* This group before the peers: the roster and its parent emails are
              what a gedu reaches for during their own session, and the peer
              rows only matter when somebody asks for cover. */}
          {assignedGroup && (
            <GroupRailCard
              group={assignedGroup}
              heading={groupHeading}
              isRemote={data.product.is_remote}
              voiceIsOpen={voiceState.voiceIsOpen}
              opensDate={voiceState.opensDate}
              opensTime={voiceState.opensTime}
              backHref={workspaceHref}
              platform={platform}
              onSaveGameUsername={onSaveGameUsername}
              gameStatuses={gameStatuses}
              robloxAvatarUrls={robloxAvatarUrls}
              memberFlair={memberFlair}
              creationsOwedNow={creationsOwedNow}
              creationsObligation={creationsObligation}
              onOpenFlair={setOpenFor}
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

        {assignedGroup && (
          // One card spanning the container, holding one panel per scope. The
          // site panel is a bordered column beside the group's rather than a
          // card of its own: nesting a card inside a card announces a change of
          // kind, and these are two instances of the same kind of thing —
          // standing notes, differing only in what they are standing on.
          <Card className="lg:col-span-3 lg:row-start-1">
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
                    <SitePanel
                      siteName={site.name}
                      address={site.address}
                      publicNote={site.publicNote}
                      staffNote={site.staffNote}
                      editing={siteNotesEditing}
                      onEditingChange={onSiteNotesEditingChange}
                      onSaveNotes={onSaveSiteNotes}
                      editHref={siteEditHref}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="min-w-0 space-y-4 lg:col-span-2 lg:col-start-1 lg:row-start-2">
          {assignedGroup ? (
            // No reading-width cap of its own. The column it sits in is already
            // two thirds of a capped page, and capping again left a band of
            // dead space down the middle of the workspace between the feed and
            // the rail — which read as a rendering fault, not as typography.
            <SessionFeed
              entries={entries}
              now={feedNow}
              roster={feedRoster}
              creations={creationsObligation}
              // The final session's block is a route into the same dialog the
              // rail's buttons open — one authoring surface, reached from
              // wherever the obligation is stated.
              onOpenMemberFlair={setOpenFor}
              sourceTimeZone={sourceTimeZone}
              editingEntryId={editingEntryId}
              onEditEntry={onEditEntry}
              onSaveEntry={onSaveEntry}
              onSendReport={onSendReport}
              onAddPhoto={onAddPhoto}
              onRemovePhoto={onRemovePhoto}
            />
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                {t("noAssignedGroup")}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* One dialog for the whole page. It stays mounted with the member it was
          opened for until the close lands, so nothing in it changes under the
          reader on the way out — and it sits here, above both the rail and the
          feed, because both of them open it.

          Keyed on the member, so a draft can never outlive the person it was
          typed about. The dialog seeds its fields on the closed→open edge, so
          an `openFor` moving straight from one member to another — without a
          close in between — would carry the first one's half-written note into
          the second one's dialog. Nothing can do that today: the dialog is
          modal and its backdrop closes it before any other control is
          reachable. The key is structural rather than a fix, and it is here
          because *two* surfaces now hold this setter; a third route in would
          not have to notice this to be safe. */}
      <GamerFlairDialog
        key={openFor ?? "none"}
        open={openFor !== null}
        onOpenChange={(open) => {
          if (!open) setOpenFor(null);
        }}
        name={openMember?.first_name ?? ""}
        note={openFor === null ? "" : (memberFlair.notes[openFor] ?? "")}
        lastEditedBy={
          openFor === null ? null : (memberFlair.noteEditors[openFor] ?? null)
        }
        creations={
          openFor === null
            ? EMPTY_CREATIONS
            : (memberFlair.creations[openFor] ?? EMPTY_CREATIONS)
        }
        onSaveNote={async (text) => {
          if (openFor === null) return;
          await memberFlair.onSaveNote(openFor, text);
        }}
        onSaveCreations={async (creations) => {
          if (openFor === null) return;
          await memberFlair.onSaveCreations(openFor, creations);
        }}
      />
    </div>
  );
}

/**
 * The list a member with no creations is handed.
 *
 * A module constant rather than a `[]` literal at the call site: the dialog
 * seeds its draft from this prop on the closed→open edge, and a fresh array
 * every render is a new identity for something that is always the same nothing.
 */
const EMPTY_CREATIONS: readonly GamerCreation[] = [];

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
function ParticipantCount({ count }: { count: number }) {
  const t = useTranslations("gedu.sessionDetails");
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
      <Users className="h-3 w-3" aria-hidden />
      {t("participantCount", { count })}
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
  const g = useTranslations("common");

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
                <ParticipantCount count={group.participant_count} />
              </div>
              {/* The chips are labelled, because the line above them already
                  carries a *gamer* count — an unlabelled row of faces next to
                  "6 gamers" reads as six children, and the whole point of
                  this card is knowing whose room you would be covering. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {g("gedus")}
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
 * The figure one roster row draws, with the row's three meanings of `avatarUrl`
 * kept apart.
 *
 * Minecraft **omits** it: that platform's skin host is addressable by username,
 * so a row holding a verified name finds its own picture and handing one in
 * would only be a second source of truth. Roblox always hands over an explicit
 * value, because a Roblox render can only come from a lookup somebody made by
 * account id — leaving the prop off there would quietly mean "placeholder"
 * while reading as "not decided".
 *
 * **An unverified member has no account id, and that is checked before the map
 * is read rather than left to the lookup to miss.** Stringifying a null id
 * produces the key `"null"`, which is absent from every answer and so arrives at
 * the right silhouette by luck; the gate says what it means instead — resolving
 * an unverified handle by *name* would draw whichever stranger owns it beside a
 * child's, which is why there is nothing to look up.
 */
function rosterAvatarUrl(
  platform: GamePlatform | null,
  robloxUserId: number | null,
  renders: RobloxRenderMap | undefined,
): string | null | undefined {
  if (platform !== "roblox") return undefined;
  if (robloxUserId === null) return null;
  return renders?.[String(robloxUserId)] ?? null;
}

/**
 * This group: its own room's Join, the gedus teaching it, then every child with
 * their parent's email and the copy-all helper.
 *
 * **It is titled "My Group" by default, and it carries its size top-right.**
 * "Group" was ambiguous on a page whose other rail card is called "Other
 * groups" — the possessive is what makes the pair read as one distinction
 * rather than as two unrelated headings. That possessive is the gedu's, though,
 * so a shell whose reader owns no group hands in its own heading instead. The
 * count sits in the same corner every peer row puts its own, so "mine has
 * eight, that one has six" is one horizontal glance rather than a hunt.
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
 * **The roster renders open, with no disclosure.** A reference column that hides
 * its reference data behind a click isn't one, and on desktop it costs nothing:
 * nothing the gedu reads sits below the rail. On a phone, where this card now
 * comes *before* the timeline, its height is a scroll on the way to the feed —
 * which is the price of having the Join within reach, and it is paid in the
 * right order: the Join and the copy-all row sit above the roster inside this
 * card, so the two urgent things are still the first two things.
 *
 * **The dialog is not this card's, and the button on a row is not either.**
 * Eight rows holding eight dialogs would be eight parsers and eight drafts for a
 * surface that can only ever have one open — and the card is no longer the only
 * way in, since the final session's creations block down in the feed opens the
 * same dialog for the same people. So the page holds which member is open and
 * this card asks it to change.
 */
function GroupRailCard({
  group,
  heading,
  isRemote,
  voiceIsOpen,
  opensDate,
  opensTime,
  backHref,
  platform,
  onSaveGameUsername,
  gameStatuses,
  robloxAvatarUrls,
  memberFlair,
  creationsOwedNow,
  creationsObligation,
  onOpenFlair,
}: {
  group: GeduAssignedProductGroup;
  /** The card's heading, or `undefined` for the gedu's "My Group". */
  heading?: string;
  isRemote: boolean;
  voiceIsOpen: boolean;
  opensDate: string;
  opensTime: string;
  /** Where leaving this group's room lands — back on this workspace. */
  backHref: string;
  /** The product's game identity, or `null` for a topic that has none. */
  platform: GamePlatform | null;
  onSaveGameUsername: (
    gamerId: string,
    username: string,
  ) => void | Promise<void>;
  gameStatuses?: Readonly<Record<string, GameAccountStatus>>;
  robloxAvatarUrls?: RobloxRenderMap;
  /**
   * The roster's staff-only overlay, handed down whole. Required here for the
   * same reason it is required of the page: this card is only ever drawn on the
   * staff-only workspace, and a roster with no way in to a note is not a state
   * that page has.
   */
  memberFlair: RosterMemberFlair;
  /**
   * Whether this group's final session is currently owed creations — the gate
   * on the per-row marker. False on every unflagged product, on an open-ended
   * one, and on a flagged run whose last session has not finished yet.
   */
  creationsOwedNow: boolean;
  /** Who already has a creation, so a row can ask whether *it* is one of them. */
  creationsObligation: CreationsObligation | null;
  /**
   * Open one member's per-gamer dialog. The dialog itself belongs to the page,
   * not to this card: the final session's creations block opens the same one,
   * and a page can only ever have one open.
   */
  onOpenFlair: (participantId: string) => void;
}) {
  const t = useTranslations("gedu.sessionDetails");
  const g = useTranslations("common");
  const roster = useMemo(() => group.roster ?? [], [group.roster]);
  const emails = useMemo(
    () => deduplicateEmails(roster.map(rosterContactEmail)),
    [roster],
  );

  return (
    <RailCard
      title={heading ?? t("railGroupHeading")}
      trailing={<ParticipantCount count={group.participant_count} />}
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
          {g("gedus")}
        </p>
        {group.gedus.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noGedus")}</p>
        ) : (
          <PersonChipList people={geduChipPeople(group.gedus)} />
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("participantsLabel")}
        </p>
        {roster.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyRoster")}</p>
        ) : (
          <ul className="space-y-1.5">
            {roster.map((member) => (
              <ParticipantRosterRow
                key={member.participant_id}
                participant={member}
                platform={platform}
                onSaveGameUsername={onSaveGameUsername}
                gameStatus={gameStatuses?.[member.participant_id]}
                avatarUrl={rosterAvatarUrl(
                  platform,
                  member.roblox_user_id,
                  robloxAvatarUrls,
                )}
                newcomerJoinedAt={
                  memberFlair.newcomers[member.participant_id] ?? null
                }
                flairNow={memberFlair.now}
                hasContent={
                  (memberFlair.notes[member.participant_id] ?? "").length > 0 ||
                  (memberFlair.creations[member.participant_id]?.length ?? 0) > 0
                }
                // The itemization of the session-level obligation: while the
                // final session is owed creations, every member who has none
                // wears the marker, and it routes to the same dialog every
                // other row's button does.
                owesCreation={
                  creationsOwedNow &&
                  creationsObligation !== null &&
                  !creationsObligation.withCreations.has(member.participant_id)
                }
                // Handed to every row, not only the ones already written
                // about: an empty note is what the add flow opens, most of the
                // roster is that case, and a marker that appeared only on rows
                // that already had one would leave no way to write the first.
                onOpenFlair={() => onOpenFlair(member.participant_id)}
              />
            ))}
          </ul>
        )}
      </div>
    </RailCard>
  );
}
