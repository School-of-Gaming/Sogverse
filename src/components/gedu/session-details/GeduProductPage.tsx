"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import type { GameAccountStatus } from "@/components/game-account";
import type { SessionFeedGamer } from "@/components/gedu/session-feed";
import { showsNewcomerBadge } from "@/components/member-flair";
import { buildGeduSessionFeed } from "@/lib/gedu-session-feed";
import { platformForTopic } from "@/lib/products/topics";
import { useNow } from "@/providers";
import { useGeduAssignedProduct } from "@/services/assignments";
import {
  useEmailSessionReport,
  useGeduGroupFeed,
  useRecordAttendance,
  useSetGroupNotes,
  useSetSessionNotes,
  useSetSiteNotes,
  type GeduGroupFeed,
} from "@/services/gedu-sessions";
import { useSetGamerGroupNote } from "@/services/member-flair";
import { useUpdateGroupMemberMinecraft } from "@/services/minecraft";
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
import type { SiteNotesDraft } from "@/components/group-workspace/SiteNotesPanel";
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
 * **The staff flair rides that same copy and costs no third read.** Newcomer
 * stamps and Gedu notes are fields on the feed's roster rows, so this page never
 * asks `get_group_staff_overlay` — that RPC exists for the voice room, which
 * owns no roster document at all. What the shell does instead is fold those
 * fields into the one flair object the body takes, against the page's own clock.
 *
 * **Both reads are usually already answered before this renders.** The route's
 * server half runs the same pair and hydrates them into the cache, so a direct
 * load paints the finished workspace rather than the skeleton. Everything below
 * is written as though it had not: the skeleton, the not-assigned state and the
 * pending branches are what a client-side navigation, a refetch and a failed
 * prefetch all still land on, and they stay exactly as they were.
 */
export function GeduProductPage({ productId }: { productId: string }) {
  const { data: product, isPending: productPending } =
    useGeduAssignedProduct(productId);

  // Only asked once the assignment read has told us which group is ours; until
  // then there is nothing to key it by.
  const groupId = product?.my_group_id ?? null;
  const { data: feed, isPending: feedPending } = useGeduGroupFeed(groupId);

  if (productPending || (groupId !== null && feedPending)) {
    return <GeduProductPageSkeleton />;
  }

  if (!product || !feed) return <NotAssignedState />;

  return <Workspace product={product} feed={feed} />;
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
}: {
  product: GeduAssignedProduct;
  feed: GeduGroupFeed;
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
  const setGroupNotes = useSetGroupNotes(groupId);
  const setSiteNotes = useSetSiteNotes(groupId);
  // Both platforms' mutations, unconditionally: a hook cannot be called behind
  // a branch, and the one that is never fired costs nothing but the object it
  // returns. The dispatch happens inside the save handler instead.
  const updateMinecraft = useUpdateGroupMemberMinecraft(groupId);
  const updateRoblox = useUpdateGroupMemberRoblox(groupId);
  // The one write behind the roster's staff flair. It invalidates all four
  // documents that carry the same note — this page's feed among them — so the
  // rail relights its own button without anything here refetching by hand.
  const setGamerNote = useSetGamerGroupNote(groupId);

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
        now,
      }),
    [groupId, feed.product, feed.sessions, now],
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
  // Everything else about a seat stays on this side of the map, the contact
  // address most deliberately of all: a session card has no business holding a
  // list of parents' mailboxes, and who the report reaches is resolved
  // server-side by the route that mails them.
  const feedRoster = useMemo<SessionFeedGamer[]>(
    () =>
      feed.roster.map((member) => ({
        id: member.participant_id,
        firstName: member.first_name,
      })),
    [feed.roster],
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
   * The roster's staff-only overlay, built from **the same roster copy the rail
   * renders** — the feed's, not the assignment document's.
   *
   * That is the whole reason both readers carry the three flair fields: the
   * shell throws the assignment document's roster away above, so a page built
   * from that copy would show no badge and no note with nothing failing.
   *
   * **Absence is how "none" is spelled.** A NULL from the RPC is left out of the
   * map rather than written in as a null, because every consumer downstream —
   * the row's `hasNote`, the dialog's seed, the badge's own window check — reads
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
  const { saveEntry, sendReport } = createSessionEntrySaves({
    groupId,
    entries,
    roster: feedRoster,
    setSessionNotes,
    recordAttendance,
    emailSessionReport,
  });

  const handleSaveGroupNotes = async (draft: GroupNotesDraft) => {
    await setGroupNotes.mutateAsync({
      publicNote: draft.publicNote,
      geduNote: draft.staffNote,
    });
  };

  /**
   * Persist the venue's shared notes.
   *
   * The address is **not** sent, and there is no way from here to send one. It
   * is read-only on this surface because it is family-facing venue detail owned
   * by the location record — and it used to be echoed back on every save, which
   * meant a page loaded before an admin corrected the address quietly reverted
   * that correction the next time a gedu touched a note. The RPC no longer takes
   * one; it preserves whatever is stored.
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
      onSaveGameUsername={handleSaveGameUsername}
      gameStatuses={gameStatuses}
      robloxAvatarUrls={robloxAvatarUrls}
      memberFlair={memberFlair}
    />
  );
}
