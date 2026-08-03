"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import type { MinecraftCheckStatus } from "@/components/minecraft/minecraft-username-row";
import type {
  SessionEntryDraft,
  SessionFeedGamer,
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
  const now = useNow();
  const groupId = feed.group.id;

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
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

  const feedRoster = useMemo<SessionFeedGamer[]>(
    () =>
      feed.roster.map((member) => ({
        id: member.gamer_id,
        firstName: member.first_name,
      })),
    [feed.roster],
  );

  /**
   * The assignment document with this group's roster replaced by the feed's.
   *
   * Same children, but the feed is the copy a write invalidates, so the rail
   * shows a corrected Minecraft username the moment the round trip lands
   * instead of at the next hard navigation.
   */
  const data = useMemo<GeduAssignedProduct>(
    () => ({
      ...product,
      groups: product.groups.map((group) =>
        group.id === product.my_group_id
          ? { ...group, roster: feed.roster }
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
   * Anything that throws propagates: the feed keeps the editor open on it, with
   * the sheet and both notes exactly as they were.
   */
  const handleSaveEntry = async (entryId: string, draft: SessionEntryDraft) => {
    const entry = entries.find((candidate) => candidate.id === entryId);
    if (entry === undefined) return;
    const sessionDate = sessionDateOf(entryId, groupId);

    const currentReport = entry.kind === "no_record" ? null : entry.report;
    const currentNote = entry.kind === "no_record" ? null : entry.staffNote;

    if (
      draft.report !== (currentReport ?? "") ||
      draft.staffNote !== (currentNote ?? "")
    ) {
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

    await Promise.all(
      changed.map((gamer) =>
        recordAttendance.mutateAsync({
          sessionDate,
          gamerId: gamer.id,
          status: draft.attendance[gamer.id] ?? null,
        }),
      ),
    );
  };

  const handleSaveGroupNotes = async (draft: GroupNotesDraft) => {
    await setGroupNotes.mutateAsync({
      publicNote: draft.publicNote,
      geduNote: draft.staffNote,
    });
  };

  const handleSaveSiteNotes = async (draft: SiteNotesDraft) => {
    if (feed.site === null) return;
    await setSiteNotes.mutateAsync({
      locationId: feed.site.location_id,
      // The address is read-only on this surface — it is family-facing venue
      // detail that belongs to the location record — so it is sent back
      // unchanged rather than being dropped, which is what a null would do.
      address: feed.site.address ?? "",
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
      onEditEntry={setEditingEntryId}
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
