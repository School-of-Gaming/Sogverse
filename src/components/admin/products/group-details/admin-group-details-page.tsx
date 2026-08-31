"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import type { GameAccountStatus } from "@/components/game-account";
import {
  GroupWorkspace,
  type RosterMemberFlair,
} from "@/components/group-workspace/GroupWorkspace";
import { deriveRosterFlairMaps } from "@/components/group-workspace/derive-roster-flair";
import { createGameUsernameSave } from "@/components/group-workspace/game-username-save";
import type { GroupNotesDraft } from "@/components/group-workspace/GroupNotesPanel";
import { createSessionEntrySaves } from "@/components/group-workspace/session-entry-saves";
import type { SiteNotesDraft } from "@/components/group-workspace/SiteNotesPanel";
import type { SessionFeedGamer } from "@/components/gedu/session-feed";
import { showsNewcomerBadge } from "@/components/member-flair";
import { buildGeduSessionFeed } from "@/lib/gedu-session-feed";
import { useNow } from "@/providers";
import {
  useAdminAddSessionImage,
  useAdminDeleteSessionImage,
  useAdminEmailSessionReport,
  useAdminProductSessions,
  useAdminRecordAttendance,
  useAdminSetGroupNotes,
  useAdminSetSessionNotes,
  useAdminSetSiteNotes,
  type AdminProductSessions,
  type AdminSessionGroup,
} from "@/services/admin-sessions";
import { useGeduGroupFeed, type GeduGroupFeed } from "@/services/gedu-sessions";
import { useProductGroups } from "@/services/groups";
import { useSetGamerGroupNote } from "@/services/member-flair";
import { useUpdateGroupMemberMinecraft } from "@/services/minecraft";
import { useProductAdmin, type ProductAdminDetailRow } from "@/services/products";
import {
  useRobloxRenders,
  useUpdateGroupMemberRoblox,
} from "@/services/roblox";
import type {
  GeduAssignedProduct,
  ProductGroupsSnapshot,
  ProductType,
} from "@/types";
import { platformForTopic } from "@/lib/products/topics";
import { PRODUCT_TYPE_CONFIG } from "../product-type-config";
import { SiteAddressField } from "./site-address-field";

interface AdminGroupDetailsPageProps {
  productType: ProductType;
  productId: string;
  groupId: string;
}

/**
 * One group of one product, as an **admin** sees it — which is to say exactly
 * as the gedu teaching it sees it.
 *
 * **One body, two shells.** The page under the chrome is `GroupWorkspace`, the
 * same component `/gedu/clubs|camps|events/[id]` renders: the same masthead,
 * the same standing notes, the same reference rail with its roster, its
 * newcomer badges and its note buttons, and the same session timeline with its
 * registers and its Send. Nothing here is an
 * admin-styled copy of any of it. The admin's view of a group used to be a
 * re-composition at the foot of the product page — a group selector in front of
 * a subset of the same components — and it was a second arrangement of the same
 * material that could only ever drift from the first. A per-group page cannot:
 * whatever a gedu's workspace grows, this grows with it.
 *
 * **What the shell owns is where the data comes from, and it comes from two
 * documents rather than one.**
 *
 * - The **admin product session record** answers the product's schedule, its
 *   timezone, its venue and every group's stored sessions and standing notes.
 *   It is the document the admin write hooks below invalidate, which is what
 *   makes a saved report, a ticked register or an edited note repaint the card
 *   it was made on.
 * - The **group feed** answers who is in this group — the roster, and with it
 *   the staff-only flair. That is the copy a note write invalidates, so a note
 *   written here reaches the gedu's own page and the voice room without a
 *   reload, and theirs reaches this one.
 *
 * Two other reads ride along and are almost always already answered: the admin
 * product row (for the topic, which decides which game identity the roster
 * draws) and the groups snapshot (for each group's gedus). An admin reaches
 * this page from the product details page, which has read both under the same
 * keys.
 *
 * **The newcomer badge is drawn here.** An earlier decision kept it off every
 * admin surface; this page supersedes that for the one surface whose whole
 * claim is that an admin sees what a gedu sees. The clubs-only gate is the
 * gedu shell's, unchanged and in the same place — the shell, never the row.
 */
export function AdminGroupDetailsPage({
  productType,
  productId,
  groupId,
}: AdminGroupDetailsPageProps) {
  const t = useTranslations("admin.products");
  const s = useTranslations("admin.products.sessions");
  const config = PRODUCT_TYPE_CONFIG[productType];
  const backHref = `/admin/${config.routeSlug}/${productId}`;
  // This page's own route — where leaving a voice room joined from here lands,
  // instead of the body's gedu-workspace default (which the proxy would bounce
  // an admin off, via /gedu, onto /admin and away from this group).
  const selfHref = `${backHref}/groups/${groupId}`;

  const product = useProductAdmin(productId);
  const sessions = useAdminProductSessions(productId);
  const feed = useGeduGroupFeed(groupId);
  const groups = useProductGroups(productId);

  /**
   * Every read is settled before a word of the body is painted.
   *
   * The session record is the slow one — a term of sessions for every group on
   * the product — so the wait is announced immediately with a structured
   * skeleton rather than discovered by a timer. The other three are folded into
   * the same gate deliberately: each of them feeds something *inside* the body
   * (the roster, the gedu chips, the game identity on a row), so letting one
   * land late would grow a card under whoever is reading it.
   */
  if (
    product.isPending ||
    sessions.isPending ||
    feed.isPending ||
    groups.isPending
  ) {
    return (
      <PageFrame backHref={backHref}>
        <GroupDetailsSkeleton />
      </PageFrame>
    );
  }

  if (!product.data) {
    return (
      <PageFrame backHref={backHref}>
        <NoticeCard>{t("detailsPage.notFound")}</NoticeCard>
      </PageFrame>
    );
  }

  const group = sessions.data?.groups.find(
    (candidate) => candidate.id === groupId,
  );

  // One answer for three different misses — the record failed to load, the URL
  // names a group this product does not have, or the feed refused. All three
  // leave the page with nothing to show for this group, and none of them is
  // something an admin can act on beyond trying again.
  if (sessions.data === undefined || group === undefined || !feed.data) {
    return (
      <PageFrame backHref={backHref}>
        <NoticeCard>{s("loadFailed")}</NoticeCard>
      </PageFrame>
    );
  }

  return (
    <PageFrame backHref={backHref}>
      <Workspace
        product={product.data}
        sessions={sessions.data}
        group={group}
        feed={feed.data}
        snapshot={groups.data}
        selfHref={selfHref}
      />
    </PageFrame>
  );
}

/**
 * The page's own chrome: a back link to the product this group belongs to, and
 * whatever the state below it turned out to be.
 *
 * Hardcoded copy and a hardcoded destination, so it is readable and clickable
 * from the first frame and lands on the pixel it will still be on once four
 * reads have settled.
 */
function PageFrame({
  backHref,
  children,
}: {
  backHref: string;
  children: React.ReactNode;
}) {
  const c = useTranslations("common");

  return (
    <div className="space-y-2" data-reserve-scroll-gutter>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {c("back")}
      </Link>
      {children}
    </div>
  );
}

function NoticeCard({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * The workspace while its reads are in the air — ghosts in the shape of the
 * masthead, the standing notes, the timeline and the rail beside it.
 *
 * Nothing here survives into the loaded state, which is what makes the swap
 * free of the layout rule: the bars are not moved, they are replaced.
 */
function GroupDetailsSkeleton() {
  const s = useTranslations("admin.products.sessions");

  return (
    <div className="mx-auto max-w-7xl py-6 sm:py-10">
      {/* The bars say nothing to a screen reader, so the wait is announced in
          words instead. */}
      <p role="status" className="sr-only">
        {s("loading")}
      </p>

      <div aria-hidden>
        <header className="space-y-2 border-b border-border pb-5">
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          <div className="h-8 w-72 max-w-full animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        </header>

        <div className="mt-6 h-32 animate-pulse rounded-lg border border-input bg-muted" />

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-3 lg:gap-8">
          <div className="min-w-0 space-y-3 lg:col-span-2">
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="h-24 animate-pulse rounded-lg border border-input bg-muted"
              />
            ))}
          </div>
          <aside className="min-w-0 space-y-4">
            <div className="h-64 animate-pulse rounded-lg border border-input bg-muted" />
            <div className="h-32 animate-pulse rounded-lg border border-input bg-muted" />
          </aside>
        </div>
      </div>
    </div>
  );
}

/**
 * Everything loaded: fold four documents into the one shape the shared body
 * takes, own the editors' open/closed state, and hand every save to the write
 * behind it.
 *
 * Split from the shell above so the hooks below can be written against non-null
 * data rather than around it — there is no branch in here about whether the
 * group exists.
 */
function Workspace({
  product,
  sessions,
  group,
  feed,
  snapshot,
  selfHref,
}: {
  product: ProductAdminDetailRow;
  sessions: AdminProductSessions;
  /** This page's group, already found in the record above by the shell. */
  group: AdminSessionGroup;
  feed: GeduGroupFeed;
  /** This page's own route — handed to the body as the voice rooms' way back. */
  selfHref: string;
  /**
   * The admin groups snapshot, and the only source on this page for who teaches
   * each group. `undefined` when that read failed, which renders every group's
   * gedu list as empty rather than failing the page — the roster, the notes and
   * the sessions are all still true, and this is the one fact that is not.
   */
  snapshot: ProductGroupsSnapshot | undefined;
}) {
  const s = useTranslations("admin.products.sessions");
  const liveNow = useNow();
  const groupId = group.id;
  const productId = product.id;

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  /**
   * The clock the feed was built against while an editor is open, or `null`
   * while none is.
   *
   * **The feed's clock stops while somebody is typing into it**, for the same
   * reason it does on the gedu workspace: entry kind is derived from `now`, so
   * a tick can reclassify a session under the editor bound to it — a `future`
   * entry becomes `past` the instant its start slips by, the notes-only editor
   * is swapped for the record editor, and the draft in it is gone with no error
   * and nothing to retry. The catch-up reflow when the editor closes is the
   * direct result of the admin's own Save or Cancel.
   */
  const [feedNow, setFeedNow] = useState<Date | null>(null);
  const [groupNotesEditing, setGroupNotesEditing] = useState(false);
  const [siteNotesEditing, setSiteNotesEditing] = useState(false);
  const [gameStatuses, setGameStatuses] = useState<
    Record<string, GameAccountStatus>
  >({});

  /**
   * Which game identity this product's surfaces are about, `null` for a topic
   * that has none. The body answers the same question from the same column for
   * its rows; this copy exists because the *save* has to pick a mutation and the
   * render batch has to know whether to ask at all.
   */
  const platform = platformForTopic(product.topic);

  const setSessionNotes = useAdminSetSessionNotes(productId, groupId);
  const recordAttendance = useAdminRecordAttendance(productId, groupId);
  const emailSessionReport = useAdminEmailSessionReport(productId, groupId);
  // The photo block's two writes, product-keyed. The block itself came free
  // with the shared card; what does not travel is which document a landed
  // photo has to reappear in, which is why these are bound here rather than
  // inherited.
  const addSessionImage = useAdminAddSessionImage(productId, groupId);
  const deleteSessionImage = useAdminDeleteSessionImage(productId);
  const setGroupNotes = useAdminSetGroupNotes(productId, groupId);
  const setSiteNotes = useAdminSetSiteNotes(productId);
  // Both platforms' mutations, unconditionally: a hook cannot be called behind
  // a branch, and the one that is never fired costs nothing but the object it
  // returns.
  //
  // **Both of these work for an admin.** The routes and the RPCs behind them are
  // gedu-or-admin since 00205 — an admin already held exactly this edit on the
  // admin users page, on any user and with no group involved at all, so the
  // narrower posture here was the odd one out rather than a boundary. What did
  // not move is the target-role check: a game account belongs to a child, so a
  // row keyed to an adult seat is refused for gedu and admin alike.
  const updateMinecraft = useUpdateGroupMemberMinecraft(groupId);
  const updateRoblox = useUpdateGroupMemberRoblox(groupId);
  // The one write behind the roster's staff flair. It invalidates the feed —
  // this page's roster copy — along with every other document carrying the same
  // note, so an edit here relights the button on the gedu's page too.
  const setGamerNote = useSetGamerGroupNote(groupId);

  /**
   * The account ids whose Roblox figure this roster needs — verified rows only,
   * and only on a Roblox product. One call for the whole list, never one per
   * row: the upstream cost is per request against a shared per-minute budget.
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
  const { data: robloxAvatarUrls } = useRobloxRenders(robloxIds, "full");

  const now = feedNow ?? liveNow;

  const entries = useMemo(
    () =>
      buildGeduSessionFeed({
        groupId,
        timezone: sessions.product.timezone,
        slots: sessions.product.schedule_slots.map((slot) => ({
          weekday: slot.weekday,
          startTime: slot.start_time,
          durationMinutes: slot.duration_minutes,
        })),
        startDate: sessions.product.start_date,
        endDate: sessions.product.end_date,
        sessions: group.sessions,
        now,
      }),
    [groupId, sessions.product, group.sessions, now],
  );

  // The attendance checklist takes id + first name and nothing else; everything
  // else about a seat stays on this side of the map, the contact address most
  // deliberately of all.
  const feedRoster = useMemo<SessionFeedGamer[]>(
    () =>
      feed.roster.map((member) => ({
        id: member.participant_id,
        firstName: member.first_name,
      })),
    [feed.roster],
  );

  /**
   * The assignment-shaped document the shared body takes, assembled from the
   * three reads that each own a piece of it.
   *
   * - The **groups and their order** are the session record's, which is already
   *   ordered the way the groups panel orders them.
   * - **This group's roster and headcount** are the feed's, and they are the
   *   same array so the two cannot disagree: a rail saying "8 gamers" over a
   *   list of seven is a discrepancy in the one place somebody goes to check
   *   exactly that. A peer group's count is its own thin roster's length.
   * - The **gedus** are the snapshot's, because no other document here knows
   *   who teaches a group.
   *
   * `my_group_id` is the group in the URL. On the gedu side that field means
   * "the one that is yours"; here it means "the one this page is about", which
   * is the same question the body asks it — which group do I render in full.
   */
  const gedusByGroup = useMemo(
    () => new Map((snapshot?.groups ?? []).map((g) => [g.id, g.gedus])),
    [snapshot],
  );

  const data = useMemo<GeduAssignedProduct>(
    () => ({
      product: {
        id: product.id,
        product_type: product.product_type,
        topic: product.topic,
        timezone: sessions.product.timezone,
        start_date: sessions.product.start_date,
        end_date: sessions.product.end_date,
        is_remote: sessions.product.is_remote,
        translations: feed.product.translations,
        schedule_slots: sessions.product.schedule_slots,
      },
      my_group_id: groupId,
      groups: sessions.groups.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        created_at: candidate.created_at,
        is_my_group: candidate.id === groupId,
        participant_count:
          candidate.id === groupId
            ? feed.roster.length
            : candidate.roster.length,
        gedus: (gedusByGroup.get(candidate.id) ?? []).map((gedu) => ({
          id: gedu.id,
          first_name: gedu.first_name,
        })),
        roster: candidate.id === groupId ? feed.roster : null,
      })),
    }),
    [product, sessions, feed.product.translations, feed.roster, groupId, gedusByGroup],
  );

  /**
   * The roster's staff-only overlay, built from **the same roster copy the rail
   * renders** — the feed's.
   *
   * **The turn is the gedu shell's**, imported rather than reproduced: the
   * clubs-only gate and the absence-is-none convention are rules about the
   * document, not about who is reading it, and a second copy of them is a second
   * place for a badge to appear on a camp. What this shell owns is only the
   * gate's input — the product type it reads it from, which is the admin row's
   * here and the assignment document's there.
   */
  const drawsNewcomerBadge = showsNewcomerBadge(product.product_type);
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
   * Open or close an entry's editor, stopping and restarting the feed's clock
   * with it. Taken in the same handler as the open — not in an effect after it
   * — so there is no render in between on which the tick could still land.
   */
  const handleEditEntry = (entryId: string | null) => {
    setFeedNow(entryId === null ? null : liveNow);
    setEditingEntryId(entryId);
  };

  /**
   * Save and Send for one session card, bound to this group's entries and this
   * surface's product-keyed mutations.
   *
   * **The same implementation the gedu workspace runs**, imported rather than
   * reproduced: the attendance diff, the notes-before-marks ordering and the
   * partial-failure classification are rules about the record, not about who is
   * looking at it.
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

  const handleSaveGroupNotes = async (draft: GroupNotesDraft) => {
    await setGroupNotes.mutateAsync({
      publicNote: draft.publicNote,
      geduNote: draft.staffNote,
    });
  };

  /**
   * Persist the venue's shared notes.
   *
   * The address is **not** sent: it belongs to the location record, the RPC
   * does not accept one, and it is written by its own control beside these
   * fields — which is what stops a page loaded before somebody corrected the
   * address from quietly reverting the correction on the next note save.
   */
  const handleSaveSiteNotes = async (draft: SiteNotesDraft) => {
    if (sessions.site === null) return;
    await setSiteNotes.mutateAsync({
      locationId: sessions.site.location_id,
      publicNote: draft.publicNote,
      geduNote: draft.staffNote,
    });
  };

  /**
   * An admin correcting a child's game username, with the platform's real round
   * trip behind it — **the same implementation the gedu workspace runs**,
   * imported rather than reproduced, so a save that finds an account lands
   * **verified** and one the platform does not know lands `unverified` with the
   * name still saved.
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
      // The frame above already carries this page's back link, held in place
      // across the skeleton and the loaded state — a second one inside the
      // body would double it, and the body's own default points at /gedu.
      backLink={null}
      // Leaving a voice room joined from this page lands back on this page.
      workspaceHref={selfHref}
      // The body's default heading is "My Group", which is a claim only the
      // gedu teaching it can make — an admin holds no group here. The card
      // already carries the group's own name, so the heading is just the
      // category word.
      groupHeading={s("railGroupHeading")}
      // The very instant `entries` were built from — frozen while an editor is
      // open. Anything fresher would step around the freeze and reclassify a
      // card under somebody typing into it.
      feedNow={now}
      feedRoster={feedRoster}
      sourceTimeZone={sessions.product.timezone}
      materialUrl={feed.product.material_url}
      groupPublicNote={group.public_note}
      groupStaffNote={group.gedu_note}
      groupNotesEditing={groupNotesEditing}
      onGroupNotesEditingChange={setGroupNotesEditing}
      onSaveGroupNotes={handleSaveGroupNotes}
      site={
        sessions.site === null
          ? null
          : {
              name: sessions.site.name,
              address: sessions.site.address,
              publicNote: sessions.site.public_note,
              staffNote: sessions.site.gedu_note,
            }
      }
      siteNotesEditing={siteNotesEditing}
      onSiteNotesEditingChange={setSiteNotesEditing}
      onSaveSiteNotes={handleSaveSiteNotes}
      // The one thing this page adds to the site section that a gedu's does not
      // have: the address is family-facing venue detail owned by the location
      // record, and an admin is the only person who may write it.
      siteAddressEditor={
        sessions.site === null ? undefined : (
          <SiteAddressField
            locationId={sessions.site.location_id}
            address={sessions.site.address}
          />
        )
      }
      editingEntryId={editingEntryId}
      onEditEntry={handleEditEntry}
      onSaveEntry={saveEntry}
      onSendReport={sendReport}
      onAddPhoto={addPhoto}
      onRemovePhoto={removePhoto}
      onSaveGameUsername={handleSaveGameUsername}
      gameStatuses={gameStatuses}
      robloxAvatarUrls={robloxAvatarUrls}
      memberFlair={memberFlair}
    />
  );
}
