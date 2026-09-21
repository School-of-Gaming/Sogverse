"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import type { GameAccountStatus } from "@/components/game-account";
import {
  resolveInGroupSince,
  type SessionSubstitutionRequestDraft,
  type SessionFeedEntry,
  type SessionFeedGamer,
} from "@/components/gedu/session-feed";
import { showsNewcomerBadge } from "@/components/member-flair";
import { buildGeduSessionFeed } from "@/lib/gedu-session-feed";
import { platformForTopic } from "@/lib/products/topics";
import { productLocalDate } from "@/lib/session-occurrence";
import { useNow } from "@/providers";
import { useGeduAssignedProduct } from "@/services/assignments";
import {
  geduSessionKeys,
  useAddSessionImage,
  useDeleteSessionImage,
  useEmailSessionReport,
  useGeduGroupFeed,
  useRecordAttendance,
  useSetGroupNotes,
  useSetSessionNotes,
  useSetSiteNotes,
  type GeduGroupFeed,
} from "@/services/gedu-sessions";
import {
  resolveGamerPhotoConsents,
  useGamerPhotoConsentsForGamers,
  useProductGamerPhotoConsentTypes,
} from "@/services/gamer-photo-consents";
import {
  useSetGamerGroupCreations,
  useSetGamerGroupNote,
} from "@/services/member-flair";
import { useUpdateGroupMemberMinecraft } from "@/services/minecraft";
import {
  useRequestSessionSubstitution,
  useWithdrawSessionSubstitutionRequest,
} from "@/services/session-substitution";
import {
  useRobloxRenders,
  useUpdateGroupMemberRoblox,
} from "@/services/roblox";
import type { GeduAssignedProduct } from "@/types";
import { SessionDetailsBackLink } from "@/components/group-workspace/BackLink";
import { deriveRosterFlairMaps } from "@/components/group-workspace/derive-roster-flair";
import { createGameUsernameSave } from "@/components/group-workspace/game-username-save";
import {
  GroupWorkspace,
  type RosterMemberFlair,
} from "@/components/group-workspace/GroupWorkspace";
import type { GroupNotesDraft } from "@/components/group-workspace/GroupNotesPanel";
import { createSessionEntrySaves } from "@/components/group-workspace/session-entry-saves";
import type { SiteNotesDraft } from "@/components/group-workspace/SitePanel";
import { GeduProductPageSkeleton } from "./GeduProductPageSkeleton";

/**
 * The data shell behind `/gedu/clubs|camps|events/[id]` — the gedu's group
 * workspace.
 *
 * **Two reads, in that order, because the URL names a product and the feed is
 * keyed by a group.** The assignment RPC answers "which group here is mine, and
 * who else teaches on this product" and is what the reference rail is built
 * from; the feed RPC then answers everything about that one group in a single
 * round trip — product shell, group notes, site notes, roster, and every stored
 * session row. Both refuse a product the caller is not assigned to by returning
 * `null`, which is what the not-yours state below renders.
 *
 * **The calendar math is not in either of them.** The feed RPC returns rows and
 * schedule parameters; the merge that turns those into a descending run of
 * entries — walking the slots forward and backward, laying stored rows over the
 * projections, deciding which side of now and which side of the epoch each one
 * falls — happens in one shared module, in front of one clock.
 *
 * **The roster the rail renders comes from the feed, not from the assignment
 * read.** They are the same children, but only one of the two is invalidated
 * when a gedu fixes a game username, and a roster that does not refresh after
 * its own edit is worse than a slightly indirect one.
 *
 * **The per-member overlay rides that same copy and costs no third read.**
 * Newcomer stamps, Gedu notes and creations are all fields on the feed's roster
 * rows, so this page never asks `get_group_staff_overlay` — that RPC exists for
 * the voice room, which owns no roster document at all. What the shell does
 * instead is fold those fields into the one flair object the body takes, against
 * the page's own clock.
 *
 * **Both reads are usually already answered before this renders.** The route's
 * server half runs the same pair and hydrates them into the cache, so a direct
 * load paints the finished workspace rather than the skeleton. Everything below
 * is written as though it had not: the skeleton, the not-assigned state and the
 * pending branches are what a client-side navigation, a refetch and a failed
 * prefetch all still land on, and they stay exactly as they were.
 */
export function GeduProductPage({
  productId,
  /**
   * Which group of the product to open, from the route's `?groupId=` — `null`
   * for the caller's own assignment, which is every ordinary visit. It is a
   * segment of the read's cache key as well as an argument to it, so two groups
   * of one product never share a cached document.
   */
  groupId: requestedGroupId = null,
  /**
   * The signed-in gedu, resolved by the route's server half.
   *
   * It is a prop rather than something read from a client auth context for two
   * reasons: it is settled before the first paint, so the server render and the
   * first client render cannot disagree about whose workspace this is; and the
   * page's presentational body stays drivable from fixtures, which is what lets
   * a preview scene render the workspace as a *particular* gedu.
   */
  viewerId,
}: {
  productId: string;
  groupId?: string | null;
  viewerId: string | null;
}) {
  const { data: product, isPending: productPending } = useGeduAssignedProduct(
    productId,
    requestedGroupId,
  );

  // Only asked once the assignment read has told us which group is ours; until
  // then there is nothing to key it by.
  const groupId = product?.my_group_id ?? null;
  const { data: feed, isPending: feedPending } = useGeduGroupFeed(groupId);

  if (productPending || (groupId !== null && feedPending)) {
    return <GeduProductPageSkeleton />;
  }

  if (!product || !feed) return <NotAssignedState />;

  return <Workspace product={product} feed={feed} viewerId={viewerId} />;
}

/** The page frame around the "this isn't your product" answer. */
function NotAssignedState() {
  const t = useTranslations("gedu.sessionDetails");
  return (
    <div className="mx-auto max-w-7xl py-6 sm:py-10">
      <SessionDetailsBackLink />
      <Card className="mt-6">
        <CardContent className="p-8 text-center">
          <h2 className="text-base font-semibold">{t("notAssignedTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("notAssignedBody")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Everything loaded: derive the feed, own the editors' open/closed state, and
 * hand every save to the RPC behind it.
 *
 * Split from the shell above so the hooks below can be written against
 * non-null data rather than around it — there is no branch in here about
 * whether the group exists.
 */
function Workspace({
  product,
  feed,
  viewerId,
}: {
  product: GeduAssignedProduct;
  feed: GeduGroupFeed;
  /**
   * Who is reading — the one thing the feed's staffing cannot derive from the
   * document alone. It says who is expected and who filed which absence; it
   * does not say which of those people is at the keyboard.
   */
  viewerId: string | null;
}) {
  const liveNow = useNow();
  const groupId = feed.group.id;

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  /**
   * The clock the feed was built against when the open editor opened, or `null`
   * while none is.
   *
   * **The feed's clock stops while somebody is typing into it.** Entry kind is
   * derived from `now`, so the 30-second tick can reclassify a session under the
   * editor that is bound to it — the moment a start instant slips into the past,
   * a `future` entry becomes a `past` one, the notes-only editor is swapped for
   * the record editor, and the draft in it is gone. It costs a gedu writing next
   * week's plan at the exact minute the session begins everything they had
   * typed, with no error and nothing to retry. The same tick reflows the feed
   * under the reader, which the layout rule forbids on data's own schedule.
   *
   * Freezing is the smallest thing that closes it: while an editor is open the
   * merge sees one fixed instant, so no entry can change kind, be re-sorted, or
   * cross the now-divider underneath it. The clock resumes when the editor
   * closes, and the catch-up reflow that follows is the direct result of the
   * gedu's own Save or Cancel — which is a change they asked for.
   *
   * Deliberately scoped to the feed's `now` and nothing else. The masthead's
   * voice window reads the live clock straight from the provider and must go on
   * doing so: a Join button frozen mid-edit would be lying about whether a room
   * is open. The group and site note editors need no freeze either — neither
   * depends on entry kinds, so nothing under them can be reclassified.
   */
  const [feedNow, setFeedNow] = useState<Date | null>(null);
  const [groupNotesEditing, setGroupNotesEditing] = useState(false);
  const [siteNotesEditing, setSiteNotesEditing] = useState(false);
  const [gameStatuses, setGameStatuses] = useState<
    Record<string, GameAccountStatus>
  >({});

  /**
   * Which game identity this product's surfaces are about, `null` for a topic
   * that has none.
   *
   * The body answers the same question from the same column for its rows; this
   * copy exists because the *save* has to pick a mutation and the render batch
   * has to know whether to ask at all, and neither of those is the body's job.
   */
  const platform = platformForTopic(product.product.topic);

  const setSessionNotes = useSetSessionNotes(groupId);
  const emailSessionReport = useEmailSessionReport(groupId);
  const recordAttendance = useRecordAttendance(groupId);
  // The photo block's two writes, made by the card's Save rather than by the
  // picker. Both refresh this group's feed, which is the document the card's
  // photos are drawn from — so a saved photo arrives on the card, and a removed
  // one leaves it, with nothing here refetching by hand.
  const addSessionImage = useAddSessionImage(groupId);
  const deleteSessionImage = useDeleteSessionImage(groupId);
  const setGroupNotes = useSetGroupNotes(groupId);
  const setSiteNotes = useSetSiteNotes(groupId);
  // Both platforms' mutations, unconditionally: a hook cannot be called behind
  // a branch, and the one that is never fired costs nothing but the object it
  // returns. The dispatch happens inside the save handler instead.
  const updateMinecraft = useUpdateGroupMemberMinecraft(groupId);
  const updateRoblox = useUpdateGroupMemberRoblox(groupId);
  // The two writes behind the roster's per-member dialog. Both invalidate the
  // same four documents that carry a member's flair — this page's feed among
  // them — so the rail relights its own button without anything here refetching
  // by hand, and neither can drift into refreshing a different set.
  const setGamerNote = useSetGamerGroupNote(groupId);
  const setGamerCreations = useSetGamerGroupCreations(groupId);
  // The two writes a gedu may make about their own seat. Both invalidate the
  // five documents a substitution moves — this page's feed among them — so the card
  // that filed the absence redraws itself with nothing here refetching by hand.
  const requestSessionSubstitution = useRequestSessionSubstitution();
  const withdrawSessionSubstitutionRequest = useWithdrawSessionSubstitutionRequest();
  // Only the two substitution writes above use it, and only to wait on this page's own
  // document after them — see `settleSubstitutionWrite`.
  const queryClient = useQueryClient();

  /**
   * The account ids whose Roblox figure this roster needs — verified rows only,
   * and only on a Roblox product.
   *
   * **One call for the whole list, never one per row.** The upstream cost is per
   * request rather than per id, against a 60-per-minute budget every IP in the
   * serverless fleet draws on, so a hook mapped over eight rows is eight
   * requests where one would do — and a page of rosters could drain the bucket
   * on its own. An unverified handle contributes nothing: it has no id, and
   * resolving the *name* instead would draw whichever stranger owns it beside a
   * child's. On any other platform the list is empty, which makes no request at
   * all rather than one that answers `{}`.
   */
  const robloxIds = useMemo(
    () =>
      platform === "roblox"
        ? feed.roster
            .map((member) => member.roblox_user_id)
            .filter((id): id is number => id !== null)
        : [],
    [platform, feed.roster],
  );
  // The full figure, because that is what the roster draws — the rail is not a
  // dense list, and asking for the head as well would be a second upstream
  // request for a picture nothing here renders.
  const { data: robloxAvatarUrls } = useRobloxRenders(robloxIds, "full");

  const now = feedNow ?? liveNow;

  const entries = useMemo(
    () =>
      buildGeduSessionFeed({
        groupId,
        timezone: feed.product.timezone,
        slots: feed.product.schedule_slots.map((slot) => ({
          weekday: slot.weekday,
          startTime: slot.start_time,
          durationMinutes: slot.duration_minutes,
        })),
        startDate: feed.product.start_date,
        endDate: feed.product.end_date,
        sessions: feed.sessions,
        // The staffing derivation's two inputs, straight off the same document
        // the sessions come from — and the viewer, which is what decides whether
        // a card offers "I can't make this session" at all.
        gedus: feed.gedus,
        substitutions: feed.substitutions,
        viewerId,
        now,
      }),
    [groupId, feed.product, feed.sessions, feed.gedus, feed.substitutions, viewerId, now],
  );

  /**
   * Open or close an entry's editor, stopping and restarting the feed's clock
   * with it.
   *
   * The freeze is taken in the same handler as the open — not in an effect after
   * it — so there is no render in between on which the tick could still land.
   * Opening a *different* entry while one is open (the feed shuts the old one
   * silently) re-reads the clock rather than keeping the first freeze, so a gedu
   * working down a term does not carry an hour-old instant into their last edit.
   */
  const handleEditEntry = (entryId: string | null) => {
    setFeedNow(entryId === null ? null : liveNow);
    setEditingEntryId(entryId);
  };

  // The attendance checklist takes id + first name, so an adult on the roster
  // still shows a bare name where the rail row beside it badges "Parent".
  // Attendance itself is correct — the mark is participant-keyed and role-blind
  // — so this is an identification asymmetry, not a marking bug: a gedu can
  // tell the adult apart in the rail but not in the checklist. Accepted as a
  // minor gap for now (carrying an isAdult flag into SessionFeedGamer +
  // AttendanceRoster is the fix if it proves worth it); flagged so the lossy
  // map stays a choice rather than an oversight.
  //
  // The third field is the register's own datum: which sessions this seat was
  // in the group for. It crosses because a register that cannot tell a week-six
  // arrival from a founding member asks the gedu to answer for afternoons that
  // member had no part in.
  //
  // What stays on this side of the map is the FAMILY CONTACT DATA, most
  // deliberately of all: a session card has no business holding a list of
  // parents' mailboxes, and who the report reaches is resolved server-side by
  // the route that mails them.
  const feedRoster = useMemo<SessionFeedGamer[]>(
    () =>
      feed.roster.map((member) => ({
        id: member.participant_id,
        firstName: member.first_name,
        // Through the shared resolver, on every surface that builds this
        // roster, so no surface can decide who a register is for differently
        // from the others.
        inGroupSince: resolveInGroupSince(member.group_joined_at),
      })),
    [feed.roster],
  );

  /**
   * Who on this roster may be photographed — or `null` on a product that does
   * not ask the question, which is every product but the one delivered with
   * Lynx Educate.
   *
   * **Two small reads, made here rather than in the body**, because the body
   * takes everything as props and both shells have to answer the same question
   * the same way. Neither read blocks a paint: the page is already rendered by
   * the time they land, and both are indexed lookups of a bounded set — the
   * product's ask set, and one row per roster member.
   *
   * **They resolve long before an editor opens**, which is what makes the
   * block's arrival free of layout cost: the reads start in the same render as
   * the roster, and the block only exists inside an editor a gedu opens later.
   * Even in the worst case the marks are the trailing element of rows the
   * roster already fixed, so a late answer fills a row's own slack.
   *
   * The roster read is left disabled on a product that asks nothing, so an
   * ordinary club never asks the database about children's photo permissions at
   * all.
   */
  const { data: askedPhotoConsents } = useProductGamerPhotoConsentTypes(
    feed.product.id,
  );
  const asksPhotoConsent = (askedPhotoConsents?.length ?? 0) > 0;
  const rosterIds = useMemo(
    () => feedRoster.map((member) => member.id),
    [feedRoster],
  );
  const { data: photoConsentRows } = useGamerPhotoConsentsForGamers(rosterIds, {
    enabled: asksPhotoConsent,
  });
  const photoConsents = useMemo(
    () =>
      askedPhotoConsents && askedPhotoConsents.length > 0
        ? resolveGamerPhotoConsents(photoConsentRows ?? [], askedPhotoConsents)
        : null,
    [askedPhotoConsents, photoConsentRows],
  );

  /**
   * The assignment document with this group's roster — **and its headcount** —
   * replaced by the feed's.
   *
   * Same children, but the feed is the copy a write invalidates, so the rail
   * shows a corrected game username the moment the round trip lands instead of
   * at the next hard navigation.
   *
   * The count is overwritten alongside the rows for the same reason, and it has
   * to be the *same array* the rows are rendered from rather than a second
   * number that agrees with it today. Two caches answer "who is in this group":
   * the assignment read and the feed. A roster change invalidates one of them,
   * so leaving the count on the assignment document let the rail say "8 gamers"
   * over a list of seven — a discrepancy in the one place a gedu goes to check
   * exactly that. Deriving it from `feed.roster.length` makes them agree by
   * construction, so there is no window in which they can disagree.
   *
   * Only *this* group's count is touched. The peer groups on the rail are
   * genuinely the assignment read's to answer for: the feed knows nothing about
   * a sister cohort's roster and must not pretend to.
   */
  const data = useMemo<GeduAssignedProduct>(
    () => ({
      ...product,
      groups: product.groups.map((group) =>
        group.id === product.my_group_id
          ? { ...group, roster: feed.roster, participant_count: feed.roster.length }
          : group,
      ),
    }),
    [product, feed.roster],
  );

  /**
   * The roster's per-member overlay, built from **the same roster copy the rail
   * renders** — the feed's, not the assignment document's.
   *
   * That is the whole reason both readers carry the three flair fields: the
   * shell throws the assignment document's roster away above, so a page built
   * from that copy would show no badge and no note with nothing failing.
   *
   * **Absence is how "none" is spelled.** A NULL from the RPC is left out of the
   * map rather than written in as a null, because every consumer downstream —
   * the row's lit marker, the dialog's seed, the badge's own window check — reads
   * a missing key as the answer rather than as a gap.
   *
   * The turn itself — the clubs-only gate, and absence being how "none" is
   * spelled — is next door rather than here, because the admin group details
   * page folds the same document into the same overlay and must produce the same
   * maps. What this shell owns is only the gate's *input*: the product type it
   * reads it from.
   *
   * The clock is the page's own — frozen with the feed while a session editor is
   * open — so a newcomer meter answers off the same instant as everything
   * around it rather than inventing one.
   */
  const drawsNewcomerBadge = showsNewcomerBadge(product.product.product_type);
  const flairMaps = useMemo(
    () => deriveRosterFlairMaps(feed.roster, drawsNewcomerBadge),
    [feed.roster, drawsNewcomerBadge],
  );

  /**
   * The flair the body takes, with the write attached.
   *
   * **The mutation's promise goes straight through.** The dialog holds its own
   * `committing` flag, awaits this and closes only once it lands, so nothing
   * here derives a disabled state from `isPending` — that flag flips false a
   * beat before the dialog closes, which is exactly the frame the button must
   * not re-enable in.
   */
  const memberFlair: RosterMemberFlair = {
    now,
    ...flairMaps,
    onSaveNote: async (participantId, text) => {
      await setGamerNote.mutateAsync({ participantId, note: text });
    },
    onSaveCreations: async (participantId, creations) => {
      await setGamerCreations.mutateAsync({ participantId, creations });
    },
  };

  /**
   * Save and Send for one session card — the diff, the write ordering and the
   * failure classification — bound to this group's entries and this surface's
   * mutations.
   *
   * The logic itself is next door rather than here, because the admin product
   * page mounts the same feed against a differently-keyed set of mutations and
   * must behave identically down to which failures count as partial.
   */
  const { saveEntry, sendReport, addPhoto, removePhoto } =
    createSessionEntrySaves({
      groupId,
      entries,
      roster: feedRoster,
      setSessionNotes,
      recordAttendance,
      emailSessionReport,
      addSessionImage,
      deleteSessionImage,
    });

  /**
   * The half of a substitution write the mutation does not supply: this page's own
   * document, read again before the card lets go of its committing flag.
   *
   * Every substitution write invalidates five roots in its `onSuccess` without waiting
   * for any of them, which is right for the four documents this page is not
   * reading and not enough for the one it is. The card holds its flag until the
   * promise it is given settles, and the card **survives** the write — the feed
   * keys an entry by (group, date) — so a promise resolving on the receipt
   * would hand back a control over staffing the write has just changed, or
   * leave the flag set for ever on a card that never unmounts. Awaiting the
   * gedu-sessions key means the card is already rebuilt from the new `substitutions`
   * by the time the region clears. It is the same shape the admin shell's
   * staffing editor uses, one key over.
   */
  const settleSubstitutionWrite = async () => {
    await queryClient.invalidateQueries({ queryKey: geduSessionKeys.all });
  };

  /**
   * "I can't make this session", from the card that offers it.
   *
   * **The entry is turned back into its (group, date) pair here**, in the
   * product's own zone — the same identity the row is keyed by in Postgres and
   * the same conversion every other write on this page makes. The card never
   * sees a date at all.
   *
   * The note is **omitted rather than sent as null** when there is nothing to
   * say: the RPC's parameter carries a SQL default, and the type generator
   * types no RPC argument as nullable, so the absence of the key is how "no
   * note" is spelled.
   *
   * Awaited, and its rejection is allowed through: the dialog holds the
   * committing flag and hands its own control back on a refusal.
   */
  const handleRequestSubstitution = async (
    entry: SessionFeedEntry,
    draft: SessionSubstitutionRequestDraft,
  ) => {
    const note = draft.note.trim();
    await requestSessionSubstitution.mutateAsync({
      groupId,
      sessionDate: productLocalDate(entry.startsAt, feed.product.timezone),
      reason: draft.reason,
      ...(note.length > 0 ? { reasonNote: note } : {}),
    });
    await settleSubstitutionWrite();
  };

  const handleWithdrawSubstitutionRequest = async (requestId: string) => {
    await withdrawSessionSubstitutionRequest.mutateAsync({ requestId });
    await settleSubstitutionWrite();
  };

  const handleSaveGroupNotes = async (draft: GroupNotesDraft) => {
    await setGroupNotes.mutateAsync({
      publicNote: draft.publicNote,
      geduNote: draft.staffNote,
    });
  };

  /**
   * Persist the site's shared notes.
   *
   * The name and the address are **not** sent, and there is no way from here to
   * send either: this shell supplies no details save, so the panel renders both
   * read-only. They belong to the location record and are an admin's alone. The
   * address used to be echoed back on every note save, which meant a page
   * loaded before an admin corrected it quietly reverted that correction the
   * next time a gedu touched a note. The RPC no longer takes one; it preserves
   * whatever is stored.
   */
  const handleSaveSiteNotes = async (draft: SiteNotesDraft) => {
    if (feed.site === null) return;
    await setSiteNotes.mutateAsync({
      locationId: feed.site.location_id,
      publicNote: draft.publicNote,
      geduNote: draft.staffNote,
    });
  };

  /**
   * A gedu correcting a child's game username, with the platform's real round
   * trip behind it.
   *
   * **The same implementation the admin group details page runs**, imported
   * rather than reproduced: the platform dispatch and the
   * checking/verified/unverified machine are rules about the write, not about
   * who is making it. What this shell hands over is which platform, which
   * mutations, and where the statuses live.
   */
  const handleSaveGameUsername = createGameUsernameSave({
    platform,
    updateMinecraft,
    updateRoblox,
    setGameStatuses,
  });

  return (
    <GroupWorkspace
      data={data}
      entries={entries}
      // The very instant `entries` were built from — frozen while an editor is
      // open. Handing the feed anything fresher would step around the freeze
      // and reclassify a card under a gedu who is typing into it.
      feedNow={now}
      feedRoster={feedRoster}
      // `null` on every product that does not ask the photo consent, which is
      // what leaves the session editors' photo block exactly as it was.
      photoConsents={photoConsents}
      sourceTimeZone={feed.product.timezone}
      materialUrl={feed.product.material_url}
      groupPublicNote={feed.group.public_note}
      groupStaffNote={feed.group.gedu_note}
      groupNotesEditing={groupNotesEditing}
      onGroupNotesEditingChange={setGroupNotesEditing}
      onSaveGroupNotes={handleSaveGroupNotes}
      site={
        feed.site === null
          ? null
          : {
              name: feed.site.name,
              address: feed.site.address,
              publicNote: feed.site.public_note,
              staffNote: feed.site.gedu_note,
            }
      }
      siteNotesEditing={siteNotesEditing}
      onSiteNotesEditingChange={setSiteNotesEditing}
      onSaveSiteNotes={handleSaveSiteNotes}
      editingEntryId={editingEntryId}
      onEditEntry={handleEditEntry}
      onSaveEntry={saveEntry}
      onSendReport={sendReport}
      onAddPhoto={addPhoto}
      onRemovePhoto={removePhoto}
      // The gedu half of the staffing pair: a gedu may speak for their own
      // seat and for nothing else, so this shell supplies the two callbacks and
      // no staffing editor. The admin shell does the opposite.
      onRequestSubstitution={handleRequestSubstitution}
      onWithdrawSubstitutionRequest={handleWithdrawSubstitutionRequest}
      onSaveGameUsername={handleSaveGameUsername}
      gameStatuses={gameStatuses}
      robloxAvatarUrls={robloxAvatarUrls}
      memberFlair={memberFlair}
    />
  );
}
