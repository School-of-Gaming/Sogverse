"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import type { MinecraftCheckStatus } from "@/components/minecraft/minecraft-username-row";
import {
  PartialSessionSaveError,
  type SessionEntryDraft,
  type SessionFeedGamer,
} from "@/components/gedu/session-feed";
import { buildGeduSessionFeed, sessionEntryId } from "@/lib/gedu-session-feed";
import { useNow } from "@/providers";
import { useGeduAssignedProduct } from "@/services/assignments";
import {
  useGeduGroupFeed,
  useRecordAttendance,
  useSetGroupNotes,
  useSetSessionNotes,
  useSetSiteNotes,
  type GeduGroupFeed,
} from "@/services/gedu-sessions";
import { useUpdateGroupMemberMinecraft } from "@/services/minecraft";
import type { GeduAssignedProduct } from "@/types";
import { SessionDetailsBackLink } from "./BackLink";
import { GeduProductPageBody } from "./GeduProductPageBody";
import { GeduProductPageSkeleton } from "./GeduProductPageSkeleton";
import type { GroupNotesDraft } from "./GroupNotesPanel";
import type { SiteNotesDraft } from "./SiteNotesPanel";

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
 * when a gedu fixes a Minecraft username, and a roster that does not refresh
 * after its own edit is worse than a slightly indirect one.
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
  const [minecraftStatuses, setMinecraftStatuses] = useState<
    Record<string, MinecraftCheckStatus>
  >({});

  const setSessionNotes = useSetSessionNotes(groupId);
  const recordAttendance = useRecordAttendance(groupId);
  const setGroupNotes = useSetGroupNotes(groupId);
  const setSiteNotes = useSetSiteNotes(groupId);
  const updateMinecraft = useUpdateGroupMemberMinecraft(groupId);

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

  const feedRoster = useMemo<SessionFeedGamer[]>(
    () =>
      feed.roster.map((member) => ({
        id: member.gamer_id,
        firstName: member.first_name,
      })),
    [feed.roster],
  );

  /**
   * The assignment document with this group's roster — **and its headcount** —
   * replaced by the feed's.
   *
   * Same children, but the feed is the copy a write invalidates, so the rail
   * shows a corrected Minecraft username the moment the round trip lands
   * instead of at the next hard navigation.
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
          ? { ...group, roster: feed.roster, gamer_count: feed.roster.length }
          : group,
      ),
    }),
    [product, feed.roster],
  );

  /**
   * Persist one session's edit.
   *
   * The two written fields go in one call, because they are one row. Attendance
   * goes one call per changed mark, because that is what stops two gedus
   * marking different children in the same session from overwriting each other
   * — and only the marks that actually *changed* are sent, so reopening a
   * finished sheet and saving it untouched is free.
   *
   * **The order is what makes the failure reporting honest, so it is fixed.**
   * Notes first, alone: if they are refused, no mark has been attempted yet and
   * the save really did do nothing, which is what the plain error says. Then the
   * marks, all of them, under `allSettled` rather than `all` — because `all`
   * rejects on the first refusal while the rest of the calls are still in the
   * air, so it reports total failure over a session that is now partly written.
   * A distinct error carries that case out, and the feed has different copy for
   * it.
   *
   * Anything that throws propagates: the feed keeps the editor open on it, with
   * the sheet and both notes exactly as they were, and a retry re-sends the lot.
   * Re-sending is safe by construction — each mark is a per-child upsert, so the
   * ones that already landed are rewritten to the values they already hold.
   */
  const handleSaveEntry = async (entryId: string, draft: SessionEntryDraft) => {
    const entry = entries.find((candidate) => candidate.id === entryId);
    if (entry === undefined) return;
    const sessionDate = sessionDateOf(entryId, groupId);

    const currentReport = entry.kind === "no_record" ? null : entry.report;
    const currentNote = entry.kind === "no_record" ? null : entry.staffNote;

    const notesChanged =
      draft.report !== (currentReport ?? "") ||
      draft.staffNote !== (currentNote ?? "");

    if (notesChanged) {
      // Deliberately not settled: a refusal here happens before a single mark
      // has been attempted, so it is a total failure and throwing plainly is the
      // truth. Everything below is what can half-succeed.
      await setSessionNotes.mutateAsync({
        sessionDate,
        report: draft.report,
        geduNote: draft.staffNote,
      });
    }

    if (draft.kind !== "past") return;

    const current = entry.kind === "past" ? entry.attendance : {};
    const changed = feedRoster.filter(
      (gamer) => draft.attendance[gamer.id] !== current[gamer.id],
    );

    const settled = await Promise.allSettled(
      changed.map((gamer) =>
        recordAttendance.mutateAsync({
          sessionDate,
          gamerId: gamer.id,
          status: draft.attendance[gamer.id] ?? null,
        }),
      ),
    );

    const firstRejection = settled.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (firstRejection === undefined) return;

    const failed = changed.filter(
      (_, index) => settled[index].status === "rejected",
    );

    // "Partial" has to mean something actually landed, or the copy is its own
    // small lie. Every mark refused with no note written is a save that changed
    // nothing, and the plain total-failure message is the right one for it.
    const somethingLanded =
      notesChanged || settled.some((result) => result.status === "fulfilled");
    if (!somethingLanded) throw firstRejection.reason;

    // `cause` keeps the underlying rejection reachable for a console or a future
    // error report; the gedu is told which shape of failure it was, never the
    // Postgres code behind it.
    throw new PartialSessionSaveError(
      failed.map((gamer) => gamer.id),
      { cause: firstRejection.reason },
    );
  };

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
   * A gedu correcting a child's Minecraft username, with the real Mojang round
   * trip behind it.
   *
   * The route resolves the name server-side and stores the canonical spelling
   * with the UUID, so a save that finds an account lands **verified** — the
   * status here is read off what came back rather than guessed at, and a name
   * Mojang does not know lands `invalid` with the name still saved. A clear
   * needs no lookup and no status at all.
   */
  const handleSaveMinecraftUsername = async (
    gamerId: string,
    username: string,
  ) => {
    const trimmed = username.trim();

    if (trimmed.length === 0) {
      await updateMinecraft.mutateAsync({ gamerId, minecraftUsername: null });
      setMinecraftStatuses(({ [gamerId]: _cleared, ...rest }) => rest);
      return;
    }

    setMinecraftStatuses((prev) => ({ ...prev, [gamerId]: "checking" }));
    try {
      const result = await updateMinecraft.mutateAsync({
        gamerId,
        minecraftUsername: trimmed,
      });
      setMinecraftStatuses((prev) => ({
        ...prev,
        [gamerId]: result.minecraft_uuid === null ? "invalid" : "valid",
      }));
    } catch (error) {
      // A refused write says nothing about the name, so the row goes back to
      // whatever its account says rather than claiming a failed check.
      setMinecraftStatuses(({ [gamerId]: _cleared, ...rest }) => rest);
      throw error;
    }
  };

  return (
    <GeduProductPageBody
      data={data}
      entries={entries}
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
      onSaveEntry={handleSaveEntry}
      onSaveMinecraftUsername={handleSaveMinecraftUsername}
      minecraftStatuses={minecraftStatuses}
    />
  );
}

/**
 * The product-local date an entry id names.
 *
 * Read back off the id rather than re-derived from the entry's instant, because
 * the id is what the row is keyed by in Postgres: the two agree by construction
 * this way, and cannot drift if a snapshot's instant ever disagrees with the
 * date it was filed under.
 */
function sessionDateOf(entryId: string, groupId: string): string {
  return entryId.slice(sessionEntryId(groupId, "").length);
}
